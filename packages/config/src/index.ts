import { z } from "zod";

const DatabaseUrlSchema = z
  .string()
  .url()
  .refine(
    (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
    "Expected postgres:// or postgresql:// URL"
  );

const RedisUrlSchema = z
  .string()
  .url()
  .refine(
    (value) => value.startsWith("redis://") || value.startsWith("rediss://"),
    "Expected redis:// or rediss:// URL"
  );

const BooleanEnvSchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .optional()
  .default(false);

export const AppEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    ALLOW_LOCAL_SCAFFOLD_AUTH: BooleanEnvSchema,
    PORT: z.coerce.number().int().positive().default(4000),
    WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
    API_PUBLIC_URL: z.string().url().default("http://localhost:4000"),
    PREVIEW_CAPABILITY_SECRET: z.string().min(32).default("local-preview-capability-secret-at-least-32"),
    TRUST_PROXY: z.string().trim().min(1).default("false"),
    DATABASE_URL: DatabaseUrlSchema.optional(),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
    DATABASE_IDLE_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(30),
    DATABASE_CONNECT_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(5),
    DATABASE_PING_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
    REDIS_URL: RedisUrlSchema.optional(),
    AWS_REGION: z.string().min(1).default("eu-central-1"),
    S3_BUCKET: z.string().min(1).optional(),
    LOCAL_OBJECT_STORAGE_DIR: z.string().min(1).default(".local-object-storage"),
    MEDIA_UPLOAD_GRANT_TTL_SECONDS: z.coerce.number().int().positive().max(600).default(600),
    MEDIA_MAX_UPLOAD_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .max(10 * 1024 * 1024)
      .default(10 * 1024 * 1024),
    MEDIA_MAX_UNRESOLVED_ASSETS: z.coerce.number().int().positive().max(100).default(5),
    MEDIA_MAX_RETAINED_ASSETS: z.coerce.number().int().positive().max(10_000).default(250),
    MEDIA_MAX_DERIVATIVE_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER)
      .default(2 * 1024 * 1024 * 1024),
    MEDIA_CLEANUP_CLAIM_STALE_AFTER_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(15 * 60_000),
    MEDIA_CLEANUP_MAX_ATTEMPTS: z.coerce.number().int().positive().max(20).default(3),
    MEDIA_CLEANUP_BATCH_SIZE: z.coerce.number().int().positive().max(100).default(25),
    NETLIFY_AUTH_TOKEN: z.string().min(1).optional(),
    GOOGLE_OAUTH_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
    GOOGLE_OAUTH_REDIRECT_URI: z.string().url().optional(),
    GSC_TOKEN_ENCRYPTION_KEY: z.string().min(32).optional(),
    GSC_OAUTH_STATE_SECRET: z.string().min(32).optional(),
    RELEASE_BROWSER_VERIFICATION_ENABLED: BooleanEnvSchema,
    RELEASE_BROWSER_VERIFICATION_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
    RELEASE_BROWSER_VERIFICATION_EXECUTABLE_PATH: z.string().min(1).optional(),
    AI_REASONING_PROVIDER: z.enum(["mock", "opencode_go", "deepseek"]).default("mock"),
    AI_REASONING_MODEL: z.string().min(1).default("glm-5.2"),
    AI_REASONING_OPENCODE_GO_API_KEY: z.string().min(1).optional(),
    AI_REASONING_OPENCODE_GO_ENDPOINT: z.string().url().default("https://opencode.ai/zen/go/v1/chat/completions"),
    AI_REASONING_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
    OPPORTUNITY_RESEARCH_PROVIDER: z.enum(["mock", "deepseek"]).default("mock"),
    OPPORTUNITY_RESEARCH_MODEL: z.string().trim().min(1).default("deepseek-v4-flash"),
    OPPORTUNITY_RESEARCH_HEARTBEAT_MS: z.coerce.number().int().min(5_000).max(300_000).default(60_000),
    DEEPSEEK_API_KEY: z.string().trim().min(1).optional(),
    DEEPSEEK_BASE_URL: z.string().url().default("https://api.deepseek.com"),
    DEEPSEEK_TIMEOUT_MS: z.coerce.number().int().positive().max(300_000).default(120_000),
    DEEPSEEK_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(3).default(2),
    DEEPSEEK_MAX_RESPONSE_BYTES: z.coerce.number().int().positive().max(2_000_000).default(1_000_000),
    MASTRA_WORKFLOW_DATABASE_URL: z.string().url().optional(),
    PUBLIC_WEB_SEARCH_ENABLED: BooleanEnvSchema,
    PUBLIC_WEB_SEARCH_TIMEOUT_MS: z.coerce.number().int().positive().max(60_000).default(15_000),
    PUBLIC_WEB_SEARCH_MAX_RESPONSE_BYTES: z.coerce.number().int().positive().max(2_000_000).default(1_000_000),
    WORK_RECOVERY_STALE_AFTER_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(15 * 60_000),
    WORK_RECOVERY_MAX_COUNT: z.coerce.number().int().positive().default(3),
    WORK_RECOVERY_BATCH_SIZE: z.coerce.number().int().positive().max(100).default(25),
    BETTER_AUTH_SECRET: z.string().min(32).optional(),
    BETTER_AUTH_URL: z.string().url().optional()
  })
  .superRefine((env, ctx) => {
    if (env.OPPORTUNITY_RESEARCH_HEARTBEAT_MS * 3 >= env.WORK_RECOVERY_STALE_AFTER_MS) {
      ctx.addIssue({
        code: "custom",
        path: ["OPPORTUNITY_RESEARCH_HEARTBEAT_MS"],
        message: "Opportunity Research heartbeat must run at least three times inside the stale-work window."
      });
    }
  });

export type AppEnv = z.output<typeof AppEnvSchema>;

export const productionRequiredEnvKeys = [
  "WEB_ORIGIN",
  "API_PUBLIC_URL",
  "PREVIEW_CAPABILITY_SECRET",
  "TRUST_PROXY",
  "DATABASE_URL",
  "REDIS_URL",
  "S3_BUCKET",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "GOOGLE_OAUTH_REDIRECT_URI",
  "GSC_TOKEN_ENCRYPTION_KEY",
  "GSC_OAUTH_STATE_SECRET"
] as const;

const productionSecretEnvKeys = [
  "BETTER_AUTH_SECRET",
  "GSC_TOKEN_ENCRYPTION_KEY",
  "GSC_OAUTH_STATE_SECRET",
  "PREVIEW_CAPABILITY_SECRET"
] as const;

const knownSecretPlaceholderValues = new Set(["replace-with-at-least-32-characters", "replace-me", "changeme"]);

export function parseAppEnv(input: NodeJS.ProcessEnv): AppEnv {
  return AppEnvSchema.parse(input);
}

export function allowsLocalScaffoldAuth(env: Pick<AppEnv, "ALLOW_LOCAL_SCAFFOLD_AUTH" | "NODE_ENV">): boolean {
  return env.ALLOW_LOCAL_SCAFFOLD_AUTH && env.NODE_ENV !== "production";
}

export function assertProductionRuntimeEnv(input: NodeJS.ProcessEnv, env = parseAppEnv(input)): void {
  if (env.NODE_ENV !== "production") {
    return;
  }

  if (env.ALLOW_LOCAL_SCAFFOLD_AUTH) {
    throw new Error("Production runtime configuration must not enable ALLOW_LOCAL_SCAFFOLD_AUTH.");
  }

  if (env.TRUST_PROXY.toLowerCase() === "true") {
    throw new Error("Production runtime configuration must scope TRUST_PROXY instead of using broad true.");
  }

  if (!env.RELEASE_BROWSER_VERIFICATION_ENABLED) {
    throw new Error("Production runtime configuration must enable RELEASE_BROWSER_VERIFICATION_ENABLED.");
  }

  const missing = productionRequiredEnvKeys.filter((key) => {
    const value = input[key];
    return typeof value !== "string" || value.trim().length === 0;
  });

  if (missing.length > 0) {
    throw new Error(`Production runtime configuration is missing required variables: ${missing.join(", ")}`);
  }

  const placeholderSecrets = productionSecretEnvKeys.filter((key) => isPlaceholderSecret(input[key]));

  if (placeholderSecrets.length > 0) {
    throw new Error(
      `Production runtime configuration uses placeholder secret values: ${placeholderSecrets.join(", ")}`
    );
  }
}

export function assertProductionWorkerEnv(env: AppEnv): void {
  if (env.NODE_ENV !== "production") return;
  if (!env.DATABASE_URL) {
    throw new Error("Production worker requires DATABASE_URL.");
  }
  if (!env.REDIS_URL) {
    throw new Error("Production worker requires REDIS_URL.");
  }
  if (env.OPPORTUNITY_RESEARCH_PROVIDER !== "deepseek" || !env.DEEPSEEK_API_KEY) {
    throw new Error(
      "Production Opportunity Research worker requires OPPORTUNITY_RESEARCH_PROVIDER=deepseek and DEEPSEEK_API_KEY."
    );
  }
  const deepSeekBaseUrl = new URL(env.DEEPSEEK_BASE_URL);
  if (
    deepSeekBaseUrl.protocol !== "https:" ||
    deepSeekBaseUrl.hostname !== "api.deepseek.com" ||
    deepSeekBaseUrl.username !== "" ||
    deepSeekBaseUrl.password !== "" ||
    deepSeekBaseUrl.port !== "" ||
    deepSeekBaseUrl.search !== "" ||
    deepSeekBaseUrl.hash !== "" ||
    !["/", "/v1", "/v1/"].includes(deepSeekBaseUrl.pathname)
  ) {
    throw new Error("Production DeepSeek transport requires the official https://api.deepseek.com origin.");
  }
  if (!env.MASTRA_WORKFLOW_DATABASE_URL) {
    throw new Error("Production Opportunity Research worker requires MASTRA_WORKFLOW_DATABASE_URL.");
  }
  if (!env.PUBLIC_WEB_SEARCH_ENABLED) {
    throw new Error("Production Opportunity Research worker requires PUBLIC_WEB_SEARCH_ENABLED=true.");
  }
}

function isPlaceholderSecret(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();

  return (
    knownSecretPlaceholderValues.has(normalized) ||
    /replace|changeme|change-me|placeholder|example|default|development/u.test(normalized) ||
    /^(.)(\1)+$/u.test(normalized)
  );
}
