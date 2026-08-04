import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Module,
  Param,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import {
  CreateCustomerReportGenerationRequestSchema,
  CustomerReportArtifactRetryCommandSchema,
  CustomerReportArtifactRetryResponseSchema,
  CustomerReportGenerationJobDataSchema,
  CustomerReportGenerationResponseSchema,
  CustomerReportHtmlRenderJobDataSchema,
  CustomerReportPublicationCommandSchema,
  CustomerReportPublicationResponseSchema,
  CustomerReportReviewCommandSchema,
  CustomerReportReviewResponseSchema
} from "@localseo/contracts";
import { parseAppEnv } from "@localseo/config";
import type { FastifyReply } from "fastify";
import { BetterAuthGuard } from "../auth/guards/better-auth.guard.js";
import { PermissionGuard } from "../auth/permissions/permission.guard.js";
import { RequireProjectPermission } from "../auth/permissions/require-permission.decorator.js";
import { ProjectAccessGuard } from "../auth/project-access.guard.js";
import type { RequestWithAuth } from "../auth/types/authenticated-request.js";
import { QueueProducerService } from "../queue-producer.js";
import {
  readReportDocumentCapability,
  serializeReportDocumentCapabilityCookie,
  signReportDocumentCapability,
  type ReportDocumentCapabilityClaims
} from "../report-document-capability.js";
import { CsrfGuard } from "../security/csrf/csrf.guard.js";
import {
  assertCustomerReportGenerationWindow,
  isUuid,
  reportArtifactSummary,
  requireUuid,
  type ReportArtifactRow
} from "./reports/report-aggregate-store.js";
import { ReportsService } from "./reports/reports.service.js";

const env = parseAppEnv(process.env);

@Controller("projects/:projectId/reports")
@UseGuards(BetterAuthGuard, CsrfGuard, ProjectAccessGuard, PermissionGuard)
@RequireProjectPermission("project:read")
class ReportsController {
  constructor(
    @Inject(ReportsService) private readonly reports: ReportsService,
    @Inject(QueueProducerService) private readonly queues: QueueProducerService
  ) {}

  @Get("workspace")
  @RequireProjectPermission("report:review")
  listWorkspace(@Param("projectId") projectId: string) {
    return this.reports.listWorkspace(projectId);
  }

  @Get("candidates/:reportId")
  @RequireProjectPermission("report:review")
  async getCandidate(
    @Param("projectId") projectId: string,
    @Param("reportId") reportId: string,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const detail = await this.reports.getCandidate(projectId, reportId);
    const artifact = detail.artifacts.find(
      (candidate) => candidate.status === "staged" && candidate.artifactSha256 !== undefined
    );
    if (artifact?.artifactSha256) {
      setReportDocumentCapabilityCookie(reply, {
        kind: "candidate",
        projectId,
        reportId,
        artifactId: artifact.artifactId,
        snapshotSha256: detail.report.snapshotSha256,
        artifactSha256: artifact.artifactSha256
      });
    }
    reply.header("cache-control", "private, no-store");
    return detail;
  }

  @Post(":reportId/review")
  @RequireProjectPermission("report:review")
  async review(
    @Param("projectId") projectId: string,
    @Param("reportId") reportId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth
  ) {
    const parsed = CustomerReportReviewCommandSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException("Report review requires a valid digest-bound command.");
    const actorUserId = persistedActorUserId(request);
    if (!actorUserId) throw new BadRequestException("Report review requires a persisted user id.");
    if (parsed.data.command === "submit_for_review" && !this.queues.isQueueConfigured("report")) {
      throw new ServiceUnavailableException("Report review requires configured report rendering transport.");
    }

    const transition =
      parsed.data.command === "submit_for_review"
        ? await this.reports.submitForReview({ projectId, reportId, actorUserId, ...parsed.data })
        : await this.reports.requestChanges({ projectId, reportId, actorUserId, ...parsed.data });

    if (transition.command === "request_changes") {
      return CustomerReportReviewResponseSchema.parse(transition);
    }

    let renderDispatch: "accepted" | "not_required" = "not_required";
    if (transition.artifact.status === "pending" || transition.artifact.status === "running") {
      let accepted: boolean;
      try {
        accepted = await this.queues.enqueue({
          queueName: "report",
          jobName: "customer_report_html_render",
          jobId: transition.artifact.id,
          data: CustomerReportHtmlRenderJobDataSchema.parse({
            projectId,
            reportId,
            artifactId: transition.artifact.id,
            triggerSource: "user_action"
          }),
          options: { attempts: 3, backoff: { type: "exponential", delay: 5_000 } },
          audit: {
            projectId,
            type: "report_artifact",
            inputRef: transition.artifact.id,
            actorType: "user",
            actorUserId,
            triggerSource: "user_action"
          }
        });
      } catch (error) {
        throw new ServiceUnavailableException("Report rendering transport failed after review.", { cause: error });
      }
      if (!accepted) {
        throw new ServiceUnavailableException("Report rendering transport became unavailable after review.");
      }
      renderDispatch = "accepted";
    }

    return CustomerReportReviewResponseSchema.parse({
      command: transition.command,
      kind: transition.kind,
      reportId: transition.reportId,
      status: transition.status,
      rowVersion: transition.rowVersion,
      snapshotSha256: transition.snapshotSha256,
      artifact: reportArtifactSummary(transition.artifact),
      renderDispatch
    });
  }

  @Get(":reportId/artifacts/:artifactId")
  @RequireProjectPermission("report:review")
  getArtifact(
    @Param("projectId") projectId: string,
    @Param("reportId") reportId: string,
    @Param("artifactId") artifactId: string
  ) {
    return this.reports.getArtifact(projectId, reportId, artifactId);
  }

  @Post(":reportId/artifacts/retry")
  @RequireProjectPermission("report:review")
  async retryArtifact(
    @Param("projectId") projectId: string,
    @Param("reportId") reportId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth
  ) {
    const parsed = CustomerReportArtifactRetryCommandSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException("Report artifact retry requires a valid digest-bound command.");
    const actorUserId = persistedActorUserId(request);
    if (!actorUserId) throw new BadRequestException("Report artifact retry requires a persisted user id.");
    if (!this.queues.isQueueConfigured("report")) {
      throw new ServiceUnavailableException("Report artifact retry requires configured rendering transport.");
    }
    const transition = await this.reports.retryArtifact({ projectId, reportId, actorUserId, ...parsed.data });
    const renderDispatch = await this.enqueueReportArtifact(projectId, reportId, actorUserId, transition.artifact);
    return CustomerReportArtifactRetryResponseSchema.parse({
      command: "retry_render",
      kind: transition.kind,
      reportId,
      status: "ready_for_review",
      rowVersion: transition.report.rowVersion,
      snapshotSha256: transition.report.snapshotSha256,
      artifact: reportArtifactSummary(transition.artifact),
      renderDispatch
    });
  }

  @Post(":reportId/publish")
  @RequireProjectPermission("report:publish")
  async publish(
    @Param("projectId") projectId: string,
    @Param("reportId") reportId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth
  ) {
    return this.publishCommand(projectId, reportId, body, request, "publish");
  }

  @Post(":reportId/publish-correction")
  @RequireProjectPermission("report:correct")
  async publishCorrection(
    @Param("projectId") projectId: string,
    @Param("reportId") reportId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth
  ) {
    return this.publishCommand(projectId, reportId, body, request, "publish_correction");
  }

  @Get("published")
  listPublished(@Param("projectId") projectId: string) {
    return this.reports.listPublished(projectId);
  }

  @Get("published/:reportId")
  async getPublished(
    @Param("projectId") projectId: string,
    @Param("reportId") reportId: string,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const detail = await this.reports.getPublished(projectId, reportId);
    setReportDocumentCapabilityCookie(reply, {
      kind: "published",
      projectId,
      reportId,
      artifactId: detail.report.artifactId,
      snapshotSha256: detail.report.snapshotSha256,
      artifactSha256: detail.report.artifactSha256
    });
    reply.header("cache-control", "private, no-store");
    return detail;
  }

  @Post("generations")
  @RequireProjectPermission("report:generate")
  async generate(@Param("projectId") projectId: string, @Body() body: unknown, @Req() request: RequestWithAuth) {
    const parsed = CreateCustomerReportGenerationRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException("Report generation requires a valid month, cutoff, and idempotency key.");
    }
    const actorUserId = persistedActorUserId(request);
    if (!actorUserId) throw new BadRequestException("Report generation requires a persisted user id.");
    assertCustomerReportGenerationWindow(parsed.data.period, new Date(parsed.data.evidenceCutoffAt), new Date());

    if (!this.queues.isQueueConfigured("report")) {
      if (isUuid(projectId)) {
        await this.queues.enqueue({
          queueName: "report",
          jobName: "customer_report_generation",
          jobId: randomUUID(),
          data: { kind: "customer_report_generation_dry_run", period: parsed.data.period },
          audit: {
            projectId,
            type: "report",
            inputRef: "dry-run",
            actorType: "user",
            actorUserId,
            triggerSource: "user_action"
          }
        });
      }
      return CustomerReportGenerationResponseSchema.parse({
        kind: "dry_run",
        status: "dry_run",
        enqueuedByRequest: false
      });
    }

    const admission = await this.reports.admitGeneration({
      identity: {
        projectId,
        reportKind: "monthly_seo_progress",
        period: parsed.data.period,
        locale: "de-DE",
        timezone: "Europe/Berlin"
      },
      requestedByUserId: actorUserId,
      idempotencyKey: parsed.data.idempotencyKey,
      evidenceCutoffAt: parsed.data.evidenceCutoffAt,
      narrativeMode: parsed.data.narrativeMode,
      correctionReason: parsed.data.correctionReason
    });

    let enqueuedByRequest = false;
    if (admission.kind === "created") {
      try {
        enqueuedByRequest = await this.queues.enqueue({
          queueName: "report",
          jobName: "customer_report_generation",
          jobId: admission.runId,
          data: CustomerReportGenerationJobDataSchema.parse({ projectId, runId: admission.runId }),
          options: { attempts: 3, backoff: { type: "exponential", delay: 5_000 } },
          audit: {
            projectId,
            type: "report",
            inputRef: admission.runId,
            actorType: "user",
            actorUserId,
            triggerSource: "user_action"
          }
        });
      } catch (error) {
        await this.reports.markGenerationEnqueueFailed(projectId, admission.runId, normalizeErrorMessage(error));
        throw error;
      }
      if (!enqueuedByRequest) {
        await this.reports.markGenerationEnqueueFailed(
          projectId,
          admission.runId,
          "Report queue was not configured after generation admission."
        );
      }
    }

    return CustomerReportGenerationResponseSchema.parse({ ...admission, enqueuedByRequest });
  }

  @Get("generations/:runId")
  @RequireProjectPermission("report:generate")
  getGeneration(@Param("projectId") projectId: string, @Param("runId") runId: string) {
    return this.reports.getGeneration(projectId, runId);
  }

  private async enqueueReportArtifact(
    projectId: string,
    reportId: string,
    actorUserId: string,
    artifact: ReportArtifactRow
  ): Promise<"accepted" | "not_required"> {
    if (artifact.status !== "pending" && artifact.status !== "running") return "not_required";
    let accepted: boolean;
    try {
      accepted = await this.queues.enqueue({
        queueName: "report",
        jobName: "customer_report_html_render",
        jobId: artifact.id,
        data: CustomerReportHtmlRenderJobDataSchema.parse({ projectId, reportId, artifactId: artifact.id }),
        options: { attempts: 3, backoff: { type: "exponential", delay: 5_000 } },
        audit: {
          projectId,
          type: "report_artifact",
          inputRef: artifact.id,
          actorType: "user",
          actorUserId,
          triggerSource: "user_action"
        }
      });
    } catch (error) {
      throw new ServiceUnavailableException("Report rendering transport failed after artifact admission.", {
        cause: error
      });
    }
    if (!accepted) throw new ServiceUnavailableException("Report rendering transport became unavailable.");
    return "accepted";
  }

  private async publishCommand(
    projectId: string,
    reportId: string,
    body: unknown,
    request: RequestWithAuth,
    command: "publish" | "publish_correction"
  ) {
    const parsed = CustomerReportPublicationCommandSchema.safeParse(body ?? {});
    if (!parsed.success || parsed.data.command !== command) {
      throw new BadRequestException("Report publication requires a valid digest-bound command.");
    }
    const actorUserId = persistedActorUserId(request);
    if (!actorUserId) throw new BadRequestException("Report publication requires a persisted user id.");
    const transition = await this.reports.publish({ projectId, reportId, actorUserId, ...parsed.data });
    const report = transition.report;
    const artifact = transition.artifact;
    if (!report.publishedAt || !artifact.artifactSha256) {
      throw new Error("Published report is missing immutable publication evidence.");
    }
    return CustomerReportPublicationResponseSchema.parse({
      command,
      kind: transition.kind,
      reportId: report.id,
      status: "published",
      rowVersion: report.rowVersion,
      snapshotSha256: report.snapshotSha256,
      artifactId: artifact.id,
      artifactSha256: artifact.artifactSha256,
      publishedAt: report.publishedAt.toISOString(),
      supersededReportId: transition.supersededReportId
    });
  }
}

@Controller("projects/:projectId/reports")
class ReportDocumentController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

  @Get(":reportId/artifacts/:artifactId/document")
  async candidateDocument(
    @Param("projectId") projectId: string,
    @Param("reportId") reportId: string,
    @Param("artifactId") artifactId: string,
    @Headers("cookie") cookieHeader: string | undefined,
    @Res() reply: FastifyReply
  ) {
    const claims = requireReportDocumentCapability(cookieHeader, { projectId, reportId, artifactId }, "candidate");
    const body = await this.reports.getArtifactDocument(claims);
    return sendCustomerReportDocument(reply, body);
  }

  @Get("published/:reportId/artifacts/:artifactId/document")
  async publishedDocument(
    @Param("projectId") projectId: string,
    @Param("reportId") reportId: string,
    @Param("artifactId") artifactId: string,
    @Headers("cookie") cookieHeader: string | undefined,
    @Res() reply: FastifyReply
  ) {
    const claims = requireReportDocumentCapability(cookieHeader, { projectId, reportId, artifactId }, "published");
    const body = await this.reports.getPublishedDocument(claims);
    return sendCustomerReportDocument(reply, body);
  }
}

@Module({
  controllers: [ReportsController, ReportDocumentController],
  providers: [ReportsService],
  exports: [ReportsService]
})
export class ReportsModule {}

export { ReportsService } from "./reports/reports.service.js";
export type {
  CustomerReportDraftPersistence,
  CustomerReportGenerationAdmission,
  CustomerReportReviewTransition
} from "./reports/report-aggregate-store.js";

function sendCustomerReportDocument(reply: FastifyReply, body: Uint8Array) {
  reply.header("content-type", "text/html; charset=utf-8");
  reply.header("content-length", body.byteLength);
  reply.header("cache-control", "private, no-store");
  reply.header("x-content-type-options", "nosniff");
  reply.header("referrer-policy", "no-referrer");
  reply.removeHeader("x-frame-options");
  reply.header(
    "content-security-policy",
    `default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; script-src 'none'; connect-src 'none'; frame-ancestors ${env.WEB_ORIGIN}; base-uri 'none'; form-action 'none'`
  );
  return reply.send(Buffer.from(body));
}

function setReportDocumentCapabilityCookie(
  reply: FastifyReply,
  claims: Omit<ReportDocumentCapabilityClaims, "version" | "issuedAt" | "expiresAt">
): void {
  const token = signReportDocumentCapability(claims, env.PREVIEW_CAPABILITY_SECRET);
  reply.header("set-cookie", serializeReportDocumentCapabilityCookie(claims.artifactId, token));
}

function requireReportDocumentCapability(
  cookieHeader: string | undefined,
  route: { projectId: string; reportId: string; artifactId: string },
  kind: ReportDocumentCapabilityClaims["kind"]
): ReportDocumentCapabilityClaims {
  requireUuid(route.projectId, "Report project id must be a UUID.");
  requireUuid(route.reportId, "Report id must be a UUID.");
  requireUuid(route.artifactId, "Report artifact id must be a UUID.");
  const claims = readReportDocumentCapability(cookieHeader, route.artifactId, env.PREVIEW_CAPABILITY_SECRET);
  if (
    !claims ||
    claims.kind !== kind ||
    claims.projectId !== route.projectId ||
    claims.reportId !== route.reportId ||
    claims.artifactId !== route.artifactId
  ) {
    throw new UnauthorizedException("Report document capability is invalid or expired.");
  }
  return claims;
}

function persistedActorUserId(request: RequestWithAuth): string | undefined {
  const userId = request.auth?.user.id;
  return userId && isUuid(userId) ? userId : undefined;
}

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "report_queue_enqueue_failed";
}
