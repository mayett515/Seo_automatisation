import { createHash } from "node:crypto";
import type { ImmutableArtifactStoragePort } from "@localseo/adapters";
import {
  CustomerReportHtmlRenderJobDataSchema,
  CustomerReportHtmlRenderManifestSchema,
  CustomerReportSnapshotSchema,
  customerReportHtmlMaxBytes,
  type CustomerReportClaim,
  type CustomerReportHtmlRenderJobData,
  type CustomerReportHtmlRenderManifest,
  type CustomerReportSnapshot
} from "@localseo/contracts";
import { reportArtifacts, reports, type DatabaseClient } from "@localseo/db";
import {
  canonicalizeCustomerReportHtmlRenderManifest,
  canonicalizeCustomerReportSnapshot,
  decideCustomerReportArtifactTransition
} from "@localseo/domain";
import type { Job } from "bullmq";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { WorkerDb, WorkerDbHandle } from "../job-run.js";

const activeArtifactStatuses = ["pending", "running"] as const;

type DatabaseTransaction = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];
type ReportArtifactRow = typeof reportArtifacts.$inferSelect;
type ReportRow = typeof reports.$inferSelect;

type ClaimedArtifact = {
  artifact: ReportArtifactRow;
  report: ReportRow;
  snapshot: CustomerReportSnapshot;
  manifest: CustomerReportHtmlRenderManifest;
};

type ReportInline =
  | { kind: "text"; value: string }
  | { kind: "strong"; value: string }
  | { kind: "link"; value: string; href: string };

export class CustomerReportHtmlConfigurationError extends Error {}
export class CustomerReportHtmlEvidenceError extends Error {
  constructor(
    message: string,
    readonly failureCode: string
  ) {
    super(message);
  }
}

export function parseCustomerReportHtmlRenderJobData(data: unknown): CustomerReportHtmlRenderJobData {
  return CustomerReportHtmlRenderJobDataSchema.parse(data);
}

export async function handleCustomerReportHtmlRenderJob(
  job: Job,
  dbHandle: WorkerDbHandle | undefined,
  storage: ImmutableArtifactStoragePort
): Promise<Record<string, unknown>> {
  const data = parseCustomerReportHtmlRenderJobData(job.data);
  if (!dbHandle) {
    throw new CustomerReportHtmlConfigurationError("DATABASE_URL is required for customer report HTML jobs");
  }
  return executeCustomerReportHtmlRender({ db: dbHandle.db, data, storage });
}

export async function executeCustomerReportHtmlRender(input: {
  db: WorkerDb;
  data: CustomerReportHtmlRenderJobData;
  storage: ImmutableArtifactStoragePort;
  now?: Date;
}): Promise<Record<string, unknown>> {
  const now = input.now ?? new Date();
  let claimed: ClaimedArtifact;
  try {
    claimed = await claimReportArtifact(input.db, input.data, now);
  } catch (error) {
    if (error instanceof CustomerReportHtmlEvidenceError) {
      await markReportArtifactFailed(input.db, input.data, error.failureCode, error.message, now);
    }
    throw error;
  }

  if (claimed.artifact.status === "staged") {
    return {
      status: "already_staged",
      reportId: claimed.report.id,
      artifactId: claimed.artifact.id,
      artifactSha256: claimed.artifact.artifactSha256
    };
  }

  try {
    const html = renderCustomerReportHtml(claimed.snapshot, claimed.manifest);
    const body = Buffer.from(html, "utf8");
    if (body.byteLength > customerReportHtmlMaxBytes) {
      throw new CustomerReportHtmlEvidenceError(
        "Rendered customer report HTML exceeds the bounded artifact budget.",
        "artifact_too_large"
      );
    }
    const artifactSha256 = sha256Bytes(body);
    const storageKey = reportArtifactStorageKey({
      projectId: input.data.projectId,
      reportId: input.data.reportId,
      artifactId: input.data.artifactId,
      artifactSha256
    });
    const stored = await input.storage.putImmutableArtifact({
      key: storageKey,
      body,
      contentType: "text/html; charset=utf-8",
      sha256: artifactSha256,
      metadata: {
        projectId: input.data.projectId,
        reportId: input.data.reportId,
        artifactId: input.data.artifactId,
        snapshotSha256: claimed.report.snapshotSha256,
        manifestSha256: claimed.artifact.renderManifestSha256
      }
    });
    if (stored.key !== storageKey || stored.contentLength !== body.byteLength || stored.sha256 !== artifactSha256) {
      throw new CustomerReportHtmlEvidenceError(
        "Stored customer report HTML did not preserve its immutable byte identity.",
        "storage_identity_mismatch"
      );
    }

    const persistence = await stageReportArtifact(input.db, input.data, {
      storageKey,
      artifactSha256,
      byteSize: body.byteLength,
      now
    });
    return {
      status: persistence,
      reportId: input.data.reportId,
      artifactId: input.data.artifactId,
      artifactSha256
    };
  } catch (error) {
    if (error instanceof CustomerReportHtmlEvidenceError || isZodLikeError(error)) {
      const terminal =
        error instanceof CustomerReportHtmlEvidenceError
          ? error
          : new CustomerReportHtmlEvidenceError(
              "Stored report snapshot or render manifest failed its strict contract.",
              "contract_mismatch"
            );
      await markReportArtifactFailed(input.db, input.data, terminal.failureCode, terminal.message, now);
      throw terminal;
    }
    throw error;
  }
}

export function renderCustomerReportHtml(snapshotInput: unknown, manifestInput: unknown): string {
  const snapshot = CustomerReportSnapshotSchema.parse(snapshotInput);
  const manifest = CustomerReportHtmlRenderManifestSchema.parse(manifestInput);
  assertManifestMatchesSnapshot(manifest, snapshot);

  const evidenceByKey = new Map(snapshot.factProjection.evidence.map((evidence) => [evidence.evidenceKey, evidence]));
  const sections = [
    ["ranking_results", "Nachgewiesene Rankings"],
    ["page_delivery", "Seiten und Auslieferung"],
    ["live_health", "Live-Status"],
    ["warnings", "Hinweise"],
    ["rollback_corrections", "Korrekturen"],
    ["future_opportunities", "Naechste Chancen"]
  ] as const;
  const consumedNarrativeSlots = new Set<string>();
  const renderedSections = sections
    .map(([section, heading]) => {
      const claims = snapshot.factProjection.claims.filter((claim) => claim.section === section);
      if (claims.length === 0) return "";
      const narrativeHeading = snapshot.narrative.find(
        (fragment) => fragment.kind === "heading" && fragment.slotKey === `heading:${section}`
      );
      if (narrativeHeading) consumedNarrativeSlots.add(narrativeHeading.slotKey);
      const transitions = snapshot.narrative.filter(
        (fragment) => fragment.kind === "transition" && fragment.slotKey.startsWith(`transition:${section}:`)
      );
      for (const transition of transitions) consumedNarrativeSlots.add(transition.slotKey);
      return `<section aria-labelledby="${section}"><h2 id="${section}">${escapeHtml(narrativeHeading?.text ?? heading)}</h2>${transitions
        .map((fragment) => `<p class="narrative-transition">${escapeHtml(fragment.text)}</p>`)
        .join("")}<div class="claims">${claims
        .map((claim) => renderClaim(claim, evidenceByKey, manifest))
        .join("")}</div></section>`;
    })
    .join("");
  if (consumedNarrativeSlots.size !== snapshot.narrative.length) {
    throw new CustomerReportHtmlEvidenceError(
      "Customer report narrative contains a slot outside the deterministic section layout.",
      "narrative_slot_mismatch"
    );
  }
  const actions = snapshot.factProjection.nextActions.length
    ? `<section aria-labelledby="actions"><h2 id="actions">Naechste Schritte</h2><ul class="actions">${snapshot.factProjection.nextActions
        .map(
          (action) =>
            `<li><strong>${escapeHtml(action.label)}</strong><span>${escapeHtml(actionTargetLabel(action.target))}</span></li>`
        )
        .join("")}</ul></section>`
    : "";

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(snapshot.title)}</title><style>${reportStyles}</style></head><body><main><header><p class="eyebrow">Local SEO Monatsbericht</p><h1>${escapeHtml(snapshot.title)}</h1><p class="period">Zeitraum ${escapeHtml(reportPeriodLabel(snapshot.identity.period))} | Datenstand ${escapeHtml(formatReportDate(snapshot.evidenceCutoffAt, manifest))}</p></header>${renderedSections}${actions}<footer>Dieser Bericht basiert auf dem geprueften Datenstand des angegebenen Zeitraums.</footer></main></body></html>`;
}

async function claimReportArtifact(
  db: WorkerDb,
  data: CustomerReportHtmlRenderJobData,
  now: Date
): Promise<ClaimedArtifact> {
  const [identity] = await db
    .select({ reportIssueId: reports.reportIssueId })
    .from(reports)
    .where(and(eq(reports.id, data.reportId), eq(reports.projectId, data.projectId)))
    .limit(1);
  if (!identity)
    throw new CustomerReportHtmlEvidenceError("Report was not found for HTML rendering.", "report_not_found");

  return db.transaction(async (tx) => {
    await lockReportIssue(tx, identity.reportIssueId);
    await lockReport(tx, data.projectId, data.reportId);
    await lockReportArtifact(tx, data.projectId, data.reportId, data.artifactId);
    const [report] = await tx
      .select()
      .from(reports)
      .where(and(eq(reports.id, data.reportId), eq(reports.projectId, data.projectId)))
      .limit(1);
    const [artifact] = await tx
      .select()
      .from(reportArtifacts)
      .where(
        and(
          eq(reportArtifacts.id, data.artifactId),
          eq(reportArtifacts.reportId, data.reportId),
          eq(reportArtifacts.projectId, data.projectId)
        )
      )
      .limit(1);
    if (!report || !artifact) {
      throw new CustomerReportHtmlEvidenceError("Report HTML artifact was not found.", "artifact_not_found");
    }
    if (artifact.status === "staged") {
      return { artifact, report, snapshot: storedSnapshot(report), manifest: storedManifest(artifact) };
    }
    if (!activeArtifactStatuses.includes(artifact.status as (typeof activeArtifactStatuses)[number])) {
      throw new CustomerReportHtmlEvidenceError(
        `Report HTML artifact is already ${artifact.status}.`,
        "invalid_artifact_status"
      );
    }
    if (
      report.status !== "ready_for_review" ||
      report.reviewedSnapshotSha256 !== report.snapshotSha256 ||
      artifact.snapshotSha256 !== report.snapshotSha256
    ) {
      throw new CustomerReportHtmlEvidenceError(
        "Report HTML artifact no longer belongs to the exact reviewed snapshot.",
        "review_binding_mismatch"
      );
    }
    const snapshot = storedSnapshot(report);
    const manifest = storedManifest(artifact);
    assertManifestMatchesReport(manifest, report, artifact);
    const decision = decideCustomerReportArtifactTransition(artifact.status, "claim_render");
    if (decision.kind === "deny") {
      throw new CustomerReportHtmlEvidenceError("Report HTML artifact cannot be claimed.", decision.reason);
    }
    const [updated] = await tx
      .update(reportArtifacts)
      .set({
        status: decision.to,
        attemptCount: sql<number>`${reportArtifacts.attemptCount} + 1`,
        startedAt: artifact.startedAt ?? now,
        updatedAt: now
      })
      .where(
        and(
          eq(reportArtifacts.id, artifact.id),
          eq(reportArtifacts.projectId, artifact.projectId),
          inArray(reportArtifacts.status, activeArtifactStatuses)
        )
      )
      .returning();
    if (!updated) {
      throw new CustomerReportHtmlEvidenceError(
        "Report HTML artifact claim lost its lifecycle CAS.",
        "artifact_claim_lost"
      );
    }
    return { artifact: updated, report, snapshot, manifest };
  });
}

async function stageReportArtifact(
  db: WorkerDb,
  data: CustomerReportHtmlRenderJobData,
  output: { storageKey: string; artifactSha256: string; byteSize: number; now: Date }
): Promise<"staged" | "already_staged" | "expired"> {
  const [identity] = await db
    .select({ reportIssueId: reports.reportIssueId })
    .from(reports)
    .where(and(eq(reports.id, data.reportId), eq(reports.projectId, data.projectId)))
    .limit(1);
  if (!identity) return "expired";

  return db.transaction(async (tx) => {
    await lockReportIssue(tx, identity.reportIssueId);
    await lockReport(tx, data.projectId, data.reportId);
    await lockReportArtifact(tx, data.projectId, data.reportId, data.artifactId);
    const [report] = await tx
      .select()
      .from(reports)
      .where(and(eq(reports.id, data.reportId), eq(reports.projectId, data.projectId)))
      .limit(1);
    const [artifact] = await tx
      .select()
      .from(reportArtifacts)
      .where(
        and(
          eq(reportArtifacts.id, data.artifactId),
          eq(reportArtifacts.reportId, data.reportId),
          eq(reportArtifacts.projectId, data.projectId)
        )
      )
      .limit(1);
    if (!report || !artifact || artifact.status === "expired") return "expired";
    if (artifact.status === "staged") {
      if (
        artifact.storageKey !== output.storageKey ||
        artifact.artifactSha256 !== output.artifactSha256 ||
        artifact.byteSize !== output.byteSize
      ) {
        throw new CustomerReportHtmlEvidenceError(
          "Staged report HTML artifact has different immutable byte evidence.",
          "artifact_replay_mismatch"
        );
      }
      return "already_staged";
    }
    if (
      report.status !== "ready_for_review" ||
      report.snapshotSha256 !== artifact.snapshotSha256 ||
      report.reviewedSnapshotSha256 !== report.snapshotSha256
    ) {
      await tx
        .update(reportArtifacts)
        .set({ status: "expired", expiredAt: output.now, updatedAt: output.now })
        .where(and(eq(reportArtifacts.id, artifact.id), inArray(reportArtifacts.status, activeArtifactStatuses)));
      return "expired";
    }
    const decision = decideCustomerReportArtifactTransition(artifact.status, "stage");
    if (decision.kind === "deny") {
      throw new CustomerReportHtmlEvidenceError("Report HTML artifact cannot be staged.", decision.reason);
    }
    const [updated] = await tx
      .update(reportArtifacts)
      .set({
        status: decision.to,
        storageKey: output.storageKey,
        artifactSha256: output.artifactSha256,
        byteSize: output.byteSize,
        stagedAt: output.now,
        updatedAt: output.now
      })
      .where(and(eq(reportArtifacts.id, artifact.id), eq(reportArtifacts.status, "running")))
      .returning({ id: reportArtifacts.id });
    if (!updated) {
      throw new CustomerReportHtmlEvidenceError("Report HTML staging lost its lifecycle CAS.", "artifact_stage_lost");
    }
    return "staged";
  });
}

async function markReportArtifactFailed(
  db: WorkerDb,
  data: CustomerReportHtmlRenderJobData,
  failureCode: string,
  failureMessage: string,
  now: Date
): Promise<void> {
  const [identity] = await db
    .select({ reportIssueId: reports.reportIssueId })
    .from(reports)
    .where(and(eq(reports.id, data.reportId), eq(reports.projectId, data.projectId)))
    .limit(1);
  if (!identity) return;
  await db.transaction(async (tx) => {
    await lockReportIssue(tx, identity.reportIssueId);
    await lockReport(tx, data.projectId, data.reportId);
    await lockReportArtifact(tx, data.projectId, data.reportId, data.artifactId);
    await tx
      .update(reportArtifacts)
      .set({ status: "failed", failureCode, failureMessage, updatedAt: now })
      .where(
        and(
          eq(reportArtifacts.id, data.artifactId),
          eq(reportArtifacts.reportId, data.reportId),
          eq(reportArtifacts.projectId, data.projectId),
          inArray(reportArtifacts.status, activeArtifactStatuses)
        )
      );
  });
}

function storedSnapshot(report: ReportRow): CustomerReportSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(report.snapshotCanonicalText);
  } catch {
    throw new CustomerReportHtmlEvidenceError("Stored report snapshot is not valid JSON.", "snapshot_invalid_json");
  }
  const snapshot = CustomerReportSnapshotSchema.parse(parsed);
  const canonical = canonicalizeCustomerReportSnapshot(snapshot);
  if (canonical !== report.snapshotCanonicalText || sha256Text(canonical) !== report.snapshotSha256) {
    throw new CustomerReportHtmlEvidenceError(
      "Stored report snapshot does not match its canonical digest.",
      "snapshot_digest_mismatch"
    );
  }
  return snapshot;
}

function storedManifest(artifact: ReportArtifactRow): CustomerReportHtmlRenderManifest {
  const manifest = CustomerReportHtmlRenderManifestSchema.parse(artifact.renderManifestJson);
  const canonical = canonicalizeCustomerReportHtmlRenderManifest(manifest);
  if (canonical !== artifact.renderManifestCanonicalText || sha256Text(canonical) !== artifact.renderManifestSha256) {
    throw new CustomerReportHtmlEvidenceError(
      "Stored report render manifest does not match its canonical digest.",
      "manifest_digest_mismatch"
    );
  }
  return manifest;
}

function assertManifestMatchesReport(
  manifest: CustomerReportHtmlRenderManifest,
  report: ReportRow,
  artifact: ReportArtifactRow
): void {
  if (
    manifest.projectId !== report.projectId ||
    manifest.reportId !== report.id ||
    manifest.snapshotSha256 !== report.snapshotSha256 ||
    manifest.reportSchemaVersion !== report.schemaVersion ||
    manifest.templateVersion !== report.templateVersion ||
    artifact.snapshotSha256 !== report.snapshotSha256
  ) {
    throw new CustomerReportHtmlEvidenceError(
      "Report render manifest does not match its reviewed report.",
      "manifest_report_mismatch"
    );
  }
}

function assertManifestMatchesSnapshot(
  manifest: CustomerReportHtmlRenderManifest,
  snapshot: CustomerReportSnapshot
): void {
  if (
    manifest.projectId !== snapshot.identity.projectId ||
    manifest.snapshotSha256.length !== 64 ||
    manifest.reportSchemaVersion !== snapshot.schemaVersion ||
    manifest.templateVersion !== snapshot.templateVersion ||
    manifest.locale !== snapshot.identity.locale ||
    manifest.timezone !== snapshot.identity.timezone
  ) {
    throw new CustomerReportHtmlEvidenceError(
      "Report render manifest does not match the immutable snapshot.",
      "manifest_snapshot_mismatch"
    );
  }
}

function renderClaim(
  claim: CustomerReportClaim,
  evidenceByKey: Map<string, CustomerReportSnapshot["factProjection"]["evidence"][number]>,
  manifest: CustomerReportHtmlRenderManifest
): string {
  const evidenceLabels = claim.evidenceKeys.map((key) => evidenceByKey.get(key)?.customerLabel).filter(Boolean);
  if (evidenceLabels.length !== claim.evidenceKeys.length) {
    throw new CustomerReportHtmlEvidenceError(
      "Rendered claim is missing immutable evidence.",
      "claim_evidence_missing"
    );
  }
  const content = claimContent(claim, manifest);
  return `<article class="claim"><h3>${escapeHtml(content.title)}</h3><p>${renderInline(content.body)}</p><p class="evidence">Nachweis: ${evidenceLabels.map((label) => escapeHtml(label ?? "")).join(", ")}</p></article>`;
}

function claimContent(
  claim: CustomerReportClaim,
  manifest: CustomerReportHtmlRenderManifest
): { title: string; body: ReportInline[] } {
  switch (claim.kind) {
    case "ranking_result":
      return {
        title: claim.query,
        body: [
          { kind: "text", value: "Nachgewiesene Position " },
          { kind: "strong", value: String(claim.rank) },
          { kind: "text", value: " fuer " },
          { kind: "link", value: claim.pageUrl, href: claim.pageUrl },
          { kind: "text", value: "." }
        ]
      };
    case "page_delivery":
      return {
        title: `Seite ${claim.route}`,
        body:
          claim.deliveryState === "released_content"
            ? [{ kind: "text", value: `Version ${claim.versionNumber} wurde veroeffentlicht.` }]
            : [{ kind: "text", value: `Version ${claim.versionNumber} wurde geprueft und freigegeben.` }]
      };
    case "provider_handoff":
      return {
        title: "Auslieferung an den Hosting-Anbieter",
        body: [
          {
            kind: "text",
            value: `Die Auslieferung wurde am ${formatReportDate(claim.handedOffAt, manifest)} an ${claim.provider} uebergeben.`
          }
        ]
      };
    case "live_health":
      return {
        title: claim.health === "live_healthy" ? "Live-Pruefung erfolgreich" : "Live mit Hinweisen",
        body: [
          {
            kind: "text",
            value: `Die Live-Pruefung wurde am ${formatReportDate(claim.checkedAt, manifest)} abgeschlossen.`
          }
        ]
      };
    case "release_warning":
      return { title: claim.title, body: [{ kind: "text", value: claim.summary }] };
    case "rollback_correction":
      return {
        title: "Korrektur nach Ruecksetzung bestaetigt",
        body: [
          {
            kind: "text",
            value: `Die Ruecksetzung vom ${formatReportDate(claim.occurredAt, manifest)} wurde am ${formatReportDate(claim.verifiedAt, manifest)} live geprueft.`
          }
        ]
      };
    case "future_opportunity":
      return {
        title: claim.title,
        body: [
          {
            kind: "text",
            value: `Diese Chance bleibt als naechster Schritt eingeordnet: ${opportunityActionLabel(claim.recommendedAction)}.`
          }
        ]
      };
  }
}

function renderInline(inlines: ReportInline[]): string {
  return inlines
    .map((inline) => {
      switch (inline.kind) {
        case "text":
          return escapeHtml(inline.value);
        case "strong":
          return `<strong>${escapeHtml(inline.value)}</strong>`;
        case "link":
          return `<a href="${escapeHtml(inline.href)}">${escapeHtml(inline.value)}</a>`;
      }
    })
    .join("");
}

function formatReportDate(value: string, manifest: CustomerReportHtmlRenderManifest): string {
  const parts = new Intl.DateTimeFormat(manifest.locale, {
    timeZone: manifest.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(value));
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const day = values.get("day");
  const month = values.get("month");
  const year = values.get("year");
  if (!day || !month || !year) {
    throw new CustomerReportHtmlEvidenceError(
      "Report date could not be formatted deterministically.",
      "date_format_failed"
    );
  }
  return `${day}.${month}.${year}`;
}

function actionTargetLabel(target: CustomerReportSnapshot["factProjection"]["nextActions"][number]["target"]): string {
  switch (target.surface) {
    case "opportunity":
      return "Chance im Opportunity-Bereich pruefen";
    case "page_studio_review":
      return "Seite im Page Studio pruefen";
    case "release_review":
      return "Release im Freigabebereich pruefen";
  }
}

function opportunityActionLabel(
  action: Extract<CustomerReportClaim, { kind: "future_opportunity" }>["recommendedAction"]
): string {
  switch (action) {
    case "monitor":
      return "weiter beobachten";
    case "create_brief":
      return "Briefing erstellen";
    case "create_page_proposal":
      return "Seitenvorschlag erstellen";
    case "hold":
      return "vorerst halten";
  }
}

function reportPeriodLabel(period: string): string {
  const [year, monthValue] = period.split("-");
  const months = [
    "Januar",
    "Februar",
    "Maerz",
    "April",
    "Mai",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "Dezember"
  ];
  const month = months[Number(monthValue) - 1];
  return month && year ? `${month} ${year}` : period;
}

function reportArtifactStorageKey(input: {
  projectId: string;
  reportId: string;
  artifactId: string;
  artifactSha256: string;
}): string {
  return `reports/${input.projectId}/${input.reportId}/html/${input.artifactId}/${input.artifactSha256}.html`;
}

async function lockReportIssue(tx: DatabaseTransaction, reportIssueId: string): Promise<void> {
  await tx.execute(sql`SELECT "id" FROM "report_issues" WHERE "id" = ${reportIssueId} FOR UPDATE`);
}

async function lockReport(tx: DatabaseTransaction, projectId: string, reportId: string): Promise<void> {
  await tx.execute(sql`SELECT "id" FROM "reports" WHERE "id" = ${reportId} AND "project_id" = ${projectId} FOR UPDATE`);
}

async function lockReportArtifact(
  tx: DatabaseTransaction,
  projectId: string,
  reportId: string,
  artifactId: string
): Promise<void> {
  await tx.execute(sql`
    SELECT "id" FROM "report_artifacts"
    WHERE "id" = ${artifactId} AND "report_id" = ${reportId} AND "project_id" = ${projectId}
    FOR UPDATE
  `);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sha256Bytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function isZodLikeError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "issues" in error && Array.isArray(error.issues));
}

const reportStyles = `:root{color-scheme:light;font-family:Inter,Arial,sans-serif;color:#18211d;background:#f3f5f2}*{box-sizing:border-box}body{margin:0}main{max-width:960px;margin:0 auto;padding:48px 28px 72px}header{border-bottom:3px solid #1f6b4f;padding-bottom:24px;margin-bottom:32px}.eyebrow{font-size:13px;font-weight:700;text-transform:uppercase;color:#1f6b4f}.period{color:#53615a}h1{font-size:38px;line-height:1.15;margin:8px 0 12px}h2{font-size:23px;margin:38px 0 14px}h3{font-size:17px;margin:0 0 8px}.narrative-transition{max-width:72ch;color:#53615a;line-height:1.55;margin:0 0 16px}.claims{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.claim{background:#fff;border:1px solid #d8ded9;border-radius:6px;padding:18px}.claim p{line-height:1.55}.evidence{font-size:12px;color:#65716b}.actions{padding:0;list-style:none;display:grid;gap:10px}.actions li{display:flex;justify-content:space-between;gap:20px;background:#fff;border-left:4px solid #1f6b4f;padding:14px 16px}.actions span{color:#53615a;text-align:right}a{color:#155f46;overflow-wrap:anywhere}footer{margin-top:48px;padding-top:20px;border-top:1px solid #d8ded9;color:#65716b;font-size:12px}@media(max-width:640px){main{padding:28px 16px 48px}h1{font-size:30px}.claims{grid-template-columns:1fr}.actions li{display:block}.actions span{display:block;text-align:left;margin-top:6px}}`;
