import { z } from "zod";

export const AppEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).optional(),
  AWS_REGION: z.string().min(1).default("eu-central-1"),
  S3_BUCKET: z.string().min(1).optional(),
  NETLIFY_AUTH_TOKEN: z.string().min(1).optional(),
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
  BETTER_AUTH_SECRET: z.string().min(1).optional(),
  BETTER_AUTH_URL: z.string().url().optional()
});

export type AppEnv = z.output<typeof AppEnvSchema>;

export function parseAppEnv(input: NodeJS.ProcessEnv): AppEnv {
  return AppEnvSchema.parse(input);
}

