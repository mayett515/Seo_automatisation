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

export const AppEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  API_PUBLIC_URL: z.string().url().default("http://localhost:4000"),
  DATABASE_URL: DatabaseUrlSchema.optional(),
  REDIS_URL: RedisUrlSchema.optional(),
  AWS_REGION: z.string().min(1).default("eu-central-1"),
  S3_BUCKET: z.string().min(1).optional(),
  NETLIFY_AUTH_TOKEN: z.string().min(1).optional(),
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().url().optional(),
  GSC_TOKEN_ENCRYPTION_KEY: z.string().min(32).optional(),
  GSC_OAUTH_STATE_SECRET: z.string().min(32).optional(),
  BETTER_AUTH_SECRET: z.string().min(1).optional(),
  BETTER_AUTH_URL: z.string().url().optional(),
  TRACKING_INGEST_TOKEN: z.string().min(32).optional()
});

export type AppEnv = z.output<typeof AppEnvSchema>;

export function parseAppEnv(input: NodeJS.ProcessEnv): AppEnv {
  return AppEnvSchema.parse(input);
}
