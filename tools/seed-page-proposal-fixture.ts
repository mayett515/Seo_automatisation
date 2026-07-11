import { OpportunityBriefSchema } from "@localseo/contracts";
import { createDatabaseClient } from "@localseo/db";
import {
  loadReasoningSmokeEnvFile,
  reasoningSmokeValueAfter,
  redactReasoningSmokeText,
  type ReasoningSmokeSqlClient
} from "./reasoning-smoke-support.js";

const seed = {
  userId: "00000000-0000-4000-8000-000000000000",
  customerId: "22222222-2222-4222-8222-222222222222",
  projectId: "11111111-1111-4111-8111-111111111111",
  opportunityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
} as const;

type CliArgs = {
  envFile?: string;
  resetPageProposalState: boolean;
};

type CountRow = {
  count: number;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.envFile) {
    await loadReasoningSmokeEnvFile(args.envFile);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to seed the Page Proposal smoke fixture.");
  }

  const handle = createDatabaseClient(databaseUrl, { max: 1, idleTimeoutSeconds: 5, connectTimeoutSeconds: 5 });

  try {
    if (args.resetPageProposalState) {
      await resetPageProposalState(handle.sql);
    }

    await seedFixture(handle.sql);
    console.log("Seeded Page Proposal smoke fixture.");
    console.log(`projectId: ${seed.projectId}`);
    console.log(`userId: ${seed.userId}`);
    console.log(`opportunityId: ${seed.opportunityId}`);
  } finally {
    await handle.close();
  }
}

async function seedFixture(sql: ReasoningSmokeSqlClient): Promise<void> {
  const now = new Date().toISOString();
  const brief = OpportunityBriefSchema.parse({
    projectId: seed.projectId,
    classification: "near_term_target",
    service: "Dachreinigung",
    location: {
      name: "Muenchen",
      kind: "city",
      adjacencyReason: "manual_seed",
      existingClusterStrength: "weak"
    },
    primaryKeyword: "dachreinigung muenchen",
    secondaryKeywords: ["dach reinigen muenchen"],
    suggestedRoute: "/dachreinigung-muenchen/",
    suggestedPageType: "normal_page",
    evidence: [
      {
        sourceType: "manual_note",
        summary: "Synthetic smoke evidence for local Dachreinigung demand in Muenchen.",
        strength: "medium",
        proofTier: "internal_signal"
      }
    ],
    competitorObservations: [],
    groupHints: [],
    hubSpokeRole: "standalone",
    uniquenessRationale: "A dedicated Muenchen page can answer local Dachreinigung intent.",
    cannibalizationRisk: { level: "low", conflictingRoutes: [] },
    missingEvidence: ["Customer-safe ranking proof is not available; this remains a proposal."],
    confidence: 0.72,
    recommendedAction: "create_page_proposal"
  });

  await sql`
    insert into users (id, email, name, updated_at)
    values (${seed.userId}, 'page-proposal-smoke@example.com', 'Page Proposal Smoke Operator', ${now})
    on conflict (id) do update set
      email = excluded.email,
      name = excluded.name,
      updated_at = excluded.updated_at
  `;

  await sql`
    insert into customers (id, owner_user_id, name, updated_at)
    values (${seed.customerId}, ${seed.userId}, 'Page Proposal Smoke Customer', ${now})
    on conflict (id) do update set
      owner_user_id = excluded.owner_user_id,
      name = excluded.name,
      updated_at = excluded.updated_at
  `;

  await sql`
    insert into customer_memberships (customer_id, user_id, role, updated_at)
    values (${seed.customerId}, ${seed.userId}, 'owner', ${now})
    on conflict (customer_id, user_id) do update set
      role = excluded.role,
      updated_at = excluded.updated_at
  `;

  await sql`
    insert into projects (id, customer_id, name, status, updated_at)
    values (${seed.projectId}, ${seed.customerId}, 'Page Proposal Real-Provider Smoke', 'active', ${now})
    on conflict (id) do update set
      customer_id = excluded.customer_id,
      name = excluded.name,
      status = excluded.status,
      updated_at = excluded.updated_at
  `;

  await sql`
    insert into opportunities
      (
        id,
        project_id,
        agent_run_id,
        classification,
        primary_keyword,
        score,
        status,
        decided_by_user_id,
        status_reason,
        evidence_json,
        updated_at
      )
    values
      (
        ${seed.opportunityId},
        ${seed.projectId},
        null,
        'near_term_target',
        'dachreinigung muenchen',
        72,
        'new',
        null,
        null,
        ${JSON.stringify(brief)}::jsonb,
        ${now}
      )
    on conflict (id) do update set
      project_id = excluded.project_id,
      agent_run_id = null,
      classification = excluded.classification,
      primary_keyword = excluded.primary_keyword,
      score = excluded.score,
      status = 'new',
      decided_by_user_id = null,
      status_reason = null,
      evidence_json = excluded.evidence_json,
      updated_at = excluded.updated_at
  `;
}

async function resetPageProposalState(sql: ReasoningSmokeSqlClient): Promise<void> {
  const [immutable] = await sql<CountRow[]>`
    select count(*)::int as "count"
    from page_versions pv
    inner join page_proposals pp on pp.id = pv.page_proposal_id
    where pp.project_id = ${seed.projectId}
      and pp.opportunity_id = ${seed.opportunityId}
      and pv.status in ('approved', 'release_candidate', 'released', 'superseded')
  `;

  if ((immutable?.count ?? 0) > 0) {
    throw new Error("Refusing to reset Page Proposal smoke state because the fixture has an immutable page version.");
  }

  await sql`
    delete from page_section_notes
    where page_version_id in (
      select pv.id
      from page_versions pv
      inner join page_proposals pp on pp.id = pv.page_proposal_id
      where pp.project_id = ${seed.projectId}
        and pp.opportunity_id = ${seed.opportunityId}
    )
  `;

  await sql`
    delete from approvals
    where page_version_id in (
      select pv.id
      from page_versions pv
      inner join page_proposals pp on pp.id = pv.page_proposal_id
      where pp.project_id = ${seed.projectId}
        and pp.opportunity_id = ${seed.opportunityId}
    )
  `;

  await sql`
    delete from page_versions
    where page_proposal_id in (
      select id
      from page_proposals
      where project_id = ${seed.projectId}
        and opportunity_id = ${seed.opportunityId}
    )
  `;

  await sql`
    delete from page_proposals
    where project_id = ${seed.projectId}
      and opportunity_id = ${seed.opportunityId}
  `;

  await sql`
    delete from job_runs
    where project_id = ${seed.projectId}
      and queue_name = 'page-generation'
      and input_ref in (
        select id::text
        from agent_runs
        where project_id = ${seed.projectId}
          and task = 'page_brief_draft'
          and subject_id = ${seed.opportunityId}
      )
  `;

  await sql`
    delete from agent_runs
    where project_id = ${seed.projectId}
      and task = 'page_brief_draft'
      and subject_id = ${seed.opportunityId}
  `;
}

function parseArgs(args: string[]): CliArgs {
  return {
    envFile: reasoningSmokeValueAfter(args, "--env-file"),
    resetPageProposalState: args.includes("--reset-page-proposal-state")
  };
}

void main().catch((error: unknown) => {
  console.error(
    redactReasoningSmokeText(error instanceof Error ? error.message : "Failed to seed Page Proposal fixture.")
  );
  process.exit(1);
});
