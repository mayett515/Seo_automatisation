import "reflect-metadata";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { assertProductionRuntimeEnv, parseAppEnv } from "@localseo/config";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { mountBetterAuthFastify } from "./auth/better-auth/better-auth.fastify-mount.js";
import { BetterAuthService } from "./auth/better-auth/better-auth.service.js";
import { AppModule } from "./app.module.js";
import { resolveTrustProxy } from "./http-runtime.js";
import { RedisService } from "./redis/redis.service.js";

const env = parseAppEnv(process.env);
assertProductionRuntimeEnv(process.env, env);

const adapter = new FastifyAdapter({
  bodyLimit: 256 * 1024,
  trustProxy: resolveTrustProxy(env.TRUST_PROXY)
});

const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
  bufferLogs: true
});
const fastify = app.getHttpAdapter().getInstance();
const redis = app.get(RedisService);

fastify.addContentTypeParser(
  "application/octet-stream",
  { parseAs: "buffer", bodyLimit: env.MEDIA_MAX_UPLOAD_BYTES },
  (_request, body, done) => done(null, body)
);

await app.register(helmet);
await app.register(rateLimit, {
  global: true,
  max: 300,
  timeWindow: "1 minute",
  redis: redis.client,
  nameSpace: "local-seo-api:rate-limit:"
});

app.enableShutdownHooks();

app.enableCors({
  origin: env.WEB_ORIGIN,
  credentials: true
});

const betterAuth = app.get(BetterAuthService);
mountBetterAuthFastify(fastify, betterAuth.auth, env);

await app.listen(env.PORT, "0.0.0.0");

console.log(`Local SEO API listening on http://localhost:${env.PORT}`);
