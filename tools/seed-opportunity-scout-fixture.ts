import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createDatabaseClient } from "@localseo/db";

const seed = {
  userId: "00000000-0000-4000-8000-000000000000",
  customerId: "22222222-2222-4222-8222-222222222222",
  projectId: "11111111-1111-4111-8111-111111111111",
  mainWebsiteId: "33333333-3333-4333-8333-333333333333",
  importRunId: "44444444-4444-4444-8444-444444444444",
  syncRunId: "55555555-5555-4555-8555-555555555555",
  rowId: "66666666-6666-4666-8666-666666666666",
  signalId: "77777777-7777-4777-8777-777777777777",
  trackingEventId: "88888888-8888-4888-8888-888888888888",
  rankingProofId: "99999999-9999-4999-8999-999999999999"
} as const;

type SqlClient = ReturnType<typeof createDatabaseClient>["sql"];

type CliArgs = {
  envFile?: string;
  resetScoutState: boolean;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.envFile) {
    await loadEnvFile(args.envFile);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to seed the opportunity scout fixture.");
  }

  const handle = createDatabaseClient(databaseUrl, { max: 1, idleTimeoutSeconds: 5, connectTimeoutSeconds: 5 });

  try {
    if (args.resetScoutState) {
      await resetScoutState(handle.sql);
    }

    await seedFixture(handle.sql);
    console.log("Seeded opportunity scout smoke fixture.");
    console.log(`projectId: ${seed.projectId}`);
    console.log(`userId: ${seed.userId}`);
    console.log(`rankingProofId: ${seed.rankingProofId}`);
  } finally {
    await handle.close();
  }
}

async function seedFixture(sql: SqlClient): Promise<void> {
  const now = new Date();
  const websiteSummary = {
    discoveredRoutes: ["/", "/dachdecker/", "/entruempelung/"],
    facts: {
      brand: { name: "Martines", confidence: "high", sourceRoutes: ["/"] },
      services: [
        { value: "Dachdecker", confidence: "high", sourceRoutes: ["/dachdecker/"] },
        { value: "Entruempelung", confidence: "medium", sourceRoutes: ["/entruempelung/"] }
      ],
      areas: [
        { value: "Markt Indersdorf", confidence: "high", sourceRoutes: ["/dachdecker/"] },
        { value: "Dachau", confidence: "medium", sourceRoutes: ["/entruempelung/"] }
      ]
    }
  };
  const signalEvidence = { reason: "Dachau intent appears on a generic service page." };
  const proofEvidence = {
    sourceType: "ranking_proof",
    proofTier: "customer_safe_proof",
    locator: {
      query: "dachdecker markt indersdorf",
      pageUrl: "https://customer.example/dachdecker-markt-indersdorf/"
    },
    observedMetric: { name: "rank", value: 4 },
    entrySource: "manual_operator_entry"
  };

  await sql`
    insert into users (id, email, name, updated_at)
    values (${seed.userId}, 'local-scout-operator@example.com', 'Local Scout Operator', ${now})
    on conflict (id) do update set
      email = excluded.email,
      name = excluded.name,
      updated_at = excluded.updated_at
  `;

  await sql`
    insert into customers (id, owner_user_id, name, updated_at)
    values (${seed.customerId}, ${seed.userId}, 'Martines Smoke Customer', ${now})
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
    values (${seed.projectId}, ${seed.customerId}, 'Martines Local SEO Smoke', 'active', ${now})
    on conflict (id) do update set
      customer_id = excluded.customer_id,
      name = excluded.name,
      status = excluded.status,
      updated_at = excluded.updated_at
  `;

  await sql`
    insert into main_websites (id, project_id, source_url, updated_at)
    values (${seed.mainWebsiteId}, ${seed.projectId}, 'https://customer.example/', ${now})
    on conflict (id) do update set
      project_id = excluded.project_id,
      source_url = excluded.source_url,
      updated_at = excluded.updated_at
  `;

  await sql`
    insert into website_import_runs
      (id, project_id, main_website_id, source_url, status, artifact_key, summary_json, started_at, completed_at, updated_at)
    values
      (
        ${seed.importRunId},
        ${seed.projectId},
        ${seed.mainWebsiteId},
        'https://customer.example/',
        'completed',
        ${`website-imports/${seed.projectId}/smoke.json`},
        ${JSON.stringify(websiteSummary)}::jsonb,
        ${now},
        ${now},
        ${now}
      )
    on conflict (id) do update set
      project_id = excluded.project_id,
      main_website_id = excluded.main_website_id,
      source_url = excluded.source_url,
      status = excluded.status,
      artifact_key = excluded.artifact_key,
      summary_json = excluded.summary_json,
      completed_at = excluded.completed_at,
      updated_at = excluded.updated_at
  `;

  await sql`
    insert into gsc_sync_runs
      (id, project_id, property_url, date_from, date_to, dimensions, status, row_count, started_at, completed_at, updated_at)
    values
      (
        ${seed.syncRunId},
        ${seed.projectId},
        'https://customer.example/',
        '2026-06-01',
        '2026-06-30',
        array['query', 'page'],
        'completed',
        1,
        ${now},
        ${now},
        ${now}
      )
    on conflict (id) do update set
      project_id = excluded.project_id,
      status = excluded.status,
      row_count = excluded.row_count,
      completed_at = excluded.completed_at,
      updated_at = excluded.updated_at
  `;

  await sql`
    insert into gsc_search_analytics_rows
      (id, project_id, sync_run_id, property_url, query, page_url, clicks, impressions, ctr, position)
    values
      (
        ${seed.rowId},
        ${seed.projectId},
        ${seed.syncRunId},
        'https://customer.example/',
        'entruempelung dachau',
        'https://customer.example/entruempelung/',
        0,
        28,
        0,
        17
      )
    on conflict (id) do update set
      query = excluded.query,
      page_url = excluded.page_url,
      clicks = excluded.clicks,
      impressions = excluded.impressions,
      ctr = excluded.ctr,
      position = excluded.position
  `;

  await sql`
    insert into gsc_opportunity_signals
      (id, project_id, sync_run_id, row_id, signal_type, status, query, page_url, evidence_json, updated_at)
    values
      (
        ${seed.signalId},
        ${seed.projectId},
        ${seed.syncRunId},
        ${seed.rowId},
        'service_location_query',
        'near_term_target',
        'entruempelung dachau',
        'https://customer.example/entruempelung/',
        ${JSON.stringify(signalEvidence)}::jsonb,
        ${now}
      )
    on conflict (id) do update set
      status = excluded.status,
      query = excluded.query,
      page_url = excluded.page_url,
      evidence_json = excluded.evidence_json,
      updated_at = excluded.updated_at
  `;

  await sql`
    insert into tracking_events (id, project_id, event_name, route, occurred_at)
    values (${seed.trackingEventId}, ${seed.projectId}, 'page_view', '/entruempelung/', '2026-07-03T08:00:00.000Z')
    on conflict (id) do update set
      route = excluded.route,
      occurred_at = excluded.occurred_at
  `;

  await sql`
    insert into ranking_proofs
      (
        id,
        project_id,
        query,
        page_url,
        rank,
        captured_at,
        search_engine,
        device,
        locale,
        notes,
        created_by_user_id,
        evidence_json,
        updated_at
      )
    values
      (
        ${seed.rankingProofId},
        ${seed.projectId},
        'dachdecker markt indersdorf',
        'https://customer.example/dachdecker-markt-indersdorf/',
        4,
        '2026-07-03T10:00:00.000Z',
        'google',
        'desktop',
        'de-DE',
        'Manual smoke fixture ranking proof.',
        ${seed.userId},
        ${JSON.stringify(proofEvidence)}::jsonb,
        ${now}
      )
    on conflict (id) do update set
      rank = excluded.rank,
      captured_at = excluded.captured_at,
      notes = excluded.notes,
      evidence_json = excluded.evidence_json,
      updated_at = excluded.updated_at
  `;
}

async function resetScoutState(sql: SqlClient): Promise<void> {
  await sql`delete from opportunities where project_id = ${seed.projectId}`;
  await sql`delete from agent_runs where project_id = ${seed.projectId} and task = 'opportunity_scout'`;
  await sql`delete from job_runs where project_id = ${seed.projectId} and type = 'opportunity_scout'`;
}

async function loadEnvFile(path: string): Promise<void> {
  const content = await readFile(resolve(path), "utf8");
  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    process.env[key] = stripQuotes(value);
  }
}

function parseArgs(args: string[]): CliArgs {
  return {
    envFile: valueAfter(args, "--env-file"),
    resetScoutState: args.includes("--reset-scout-state")
  };
}

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Failed to seed opportunity scout fixture.");
  process.exit(1);
});
