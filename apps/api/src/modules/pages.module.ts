import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Module,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards
} from "@nestjs/common";
import { parseAppEnv } from "@localseo/config";
import {
  CreatePageProposalRunRequestSchema,
  CreateSectionCopySuggestionRequestSchema,
  EditPageVersionRequestSchema,
  ReviewPageVersionRequestSchema,
  type ReviewPageVersionRequest
} from "@localseo/contracts";
import type { FastifyReply } from "fastify";
import { BetterAuthGuard } from "../auth/guards/better-auth.guard.js";
import { PermissionGuard } from "../auth/permissions/permission.guard.js";
import { RequireProjectPermission } from "../auth/permissions/require-permission.decorator.js";
import { ProjectAccessGuard } from "../auth/project-access.guard.js";
import type { RequestWithAuth } from "../auth/types/authenticated-request.js";
import {
  previewAssetCookieName,
  previewDocumentCookieName,
  readCookieValue,
  serializePreviewCapabilityCookie
} from "../preview-capability.js";
import { CsrfGuard } from "../security/csrf/csrf.guard.js";
import { isPersistedId } from "./pages/page-aggregate-store.js";
import { PagesService } from "./pages/pages.service.js";

const env = parseAppEnv(process.env);

@Controller("projects/:projectId/pages")
@UseGuards(BetterAuthGuard, CsrfGuard, ProjectAccessGuard, PermissionGuard)
@RequireProjectPermission("project:read")
class PagesController {
  constructor(@Inject(PagesService) private readonly pages: PagesService) {}

  @Get()
  list(@Param("projectId") projectId: string) {
    return this.pages.listPageVersions(projectId);
  }

  @Get("proposals")
  listProposals(@Param("projectId") projectId: string) {
    return this.pages.listPageProposals(projectId);
  }

  @Post("proposals/runs")
  @RequireProjectPermission("page:propose")
  runPageProposal(@Param("projectId") projectId: string, @Body() body: unknown, @Req() request: RequestWithAuth) {
    const parsed = CreatePageProposalRunRequestSchema.safeParse(body ?? {});

    if (!parsed.success) {
      throw new BadRequestException(
        "Page proposal generation requires a project-owned opportunityId and expected opportunity revision."
      );
    }

    return this.pages.queuePageProposal(projectId, parsed.data, persistedActorUserId(request));
  }

  @Get("proposals/:pageProposalId")
  getProposal(@Param("projectId") projectId: string, @Param("pageProposalId") pageProposalId: string) {
    return this.pages.getPageProposal(projectId, pageProposalId);
  }

  @Get(":pageVersionId")
  get(@Param("projectId") projectId: string, @Param("pageVersionId") pageVersionId: string) {
    return this.pages.getPageVersion(projectId, pageVersionId);
  }

  @Get(":pageVersionId/preview")
  async preview(
    @Param("projectId") projectId: string,
    @Param("pageVersionId") pageVersionId: string,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const prepared = await this.pages.preparePageVersionPreview(projectId, pageVersionId);
    reply.header(
      "set-cookie",
      serializePreviewCapabilityCookie({
        name: previewDocumentCookieName(pageVersionId),
        token: prepared.documentToken,
        path: "/"
      })
    );
    reply.header("cache-control", "private, no-store");
    return prepared.response;
  }

  @Get(":pageVersionId/copy-suggestions")
  listCopySuggestions(@Param("projectId") projectId: string, @Param("pageVersionId") pageVersionId: string) {
    return this.pages.listSectionCopySuggestions(projectId, pageVersionId);
  }

  @Post(":pageVersionId/copy-suggestions")
  @RequireProjectPermission("page:edit")
  queueCopySuggestion(
    @Param("projectId") projectId: string,
    @Param("pageVersionId") pageVersionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth
  ) {
    const parsed = CreateSectionCopySuggestionRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException("Section copy generation requires a valid sectionId and optional instruction.");
    }

    return this.pages.queueSectionCopySuggestion(projectId, pageVersionId, parsed.data, persistedActorUserId(request));
  }

  @Patch(":pageVersionId/copy-suggestions/:suggestionId/dismiss")
  @RequireProjectPermission("page:edit")
  dismissCopySuggestion(
    @Param("projectId") projectId: string,
    @Param("pageVersionId") pageVersionId: string,
    @Param("suggestionId") suggestionId: string,
    @Req() request: RequestWithAuth
  ) {
    return this.pages.dismissSectionCopySuggestion(
      projectId,
      pageVersionId,
      suggestionId,
      persistedActorUserId(request)
    );
  }

  @Get(":pageVersionId/notes")
  listNotes(@Param("projectId") projectId: string, @Param("pageVersionId") pageVersionId: string) {
    return this.pages.listPageSectionNotes(projectId, pageVersionId);
  }

  @Post(":pageVersionId/notes")
  @RequireProjectPermission("page:comment")
  createNote(
    @Param("projectId") projectId: string,
    @Param("pageVersionId") pageVersionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth
  ) {
    return this.pages.createPageSectionNote(projectId, pageVersionId, body, persistedActorUserId(request));
  }

  @Patch(":pageVersionId/notes/:noteId/resolve")
  @RequireProjectPermission("page:comment")
  resolveNote(
    @Param("projectId") projectId: string,
    @Param("pageVersionId") pageVersionId: string,
    @Param("noteId") noteId: string,
    @Req() request: RequestWithAuth
  ) {
    return this.pages.resolvePageSectionNote(projectId, pageVersionId, noteId, persistedActorUserId(request));
  }

  @Post(":pageVersionId/edits")
  @RequireProjectPermission("page:edit")
  editVersion(
    @Param("projectId") projectId: string,
    @Param("pageVersionId") pageVersionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth
  ) {
    const parsed = EditPageVersionRequestSchema.safeParse(body ?? {});

    if (!parsed.success) {
      throw new BadRequestException("Page Studio edit requires a valid explicit edit command.");
    }

    return this.pages.editPageVersion(projectId, pageVersionId, parsed.data, persistedActorUserId(request));
  }

  @Post(":pageVersionId/review")
  @RequireProjectPermission("page:approve")
  reviewVersion(
    @Param("projectId") projectId: string,
    @Param("pageVersionId") pageVersionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth
  ) {
    return this.pages.reviewPageVersion(
      projectId,
      pageVersionId,
      parseReviewPageVersionRequest(body),
      persistedActorUserId(request)
    );
  }
}

@Controller("projects/:projectId/pages")
class PagePreviewDocumentController {
  constructor(@Inject(PagesService) private readonly pages: PagesService) {}

  @Get(":pageVersionId/preview/document")
  async document(
    @Param("projectId") projectId: string,
    @Param("pageVersionId") pageVersionId: string,
    @Headers("cookie") cookieHeader: string | undefined,
    @Res() reply: FastifyReply
  ) {
    const result = await this.pages.previewPageVersionDocument(
      projectId,
      pageVersionId,
      readCookieValue(cookieHeader, previewDocumentCookieName(pageVersionId))
    );
    reply.removeHeader("x-frame-options");
    reply.header(
      "content-security-policy",
      `default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors ${env.WEB_ORIGIN}`
    );
    reply.header("referrer-policy", "no-referrer");
    reply.header("cache-control", "private, no-store");
    reply.header("content-type", result.file.contentType);
    reply.header(
      "set-cookie",
      serializePreviewCapabilityCookie({
        name: previewAssetCookieName(pageVersionId),
        token: result.assetToken,
        path: "/assets"
      })
    );
    return reply.send(result.file.body);
  }
}

@Module({
  controllers: [PagesController, PagePreviewDocumentController],
  providers: [PagesService]
})
export class PagesModule {}

export { PagesService } from "./pages/pages.service.js";

function parseReviewPageVersionRequest(body: unknown): ReviewPageVersionRequest {
  const parsed = ReviewPageVersionRequestSchema.safeParse(body ?? {});
  if (parsed.success) return parsed.data;

  const decisionNoteIssue = parsed.error.issues.find(
    (issue) => issue.path[0] === "decisionNote" && issue.message === "Requesting changes requires a decision note."
  );
  throw new BadRequestException(decisionNoteIssue?.message ?? "Page version review requires a valid review decision.");
}

function persistedActorUserId(request: RequestWithAuth): string | undefined {
  const userId = request.auth?.user.id;
  return userId && isPersistedId(userId) ? userId : undefined;
}
