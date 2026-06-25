import "reflect-metadata";
import { parseAppEnv } from "@localseo/config";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";

const env = parseAppEnv(process.env);

const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
  bufferLogs: true
});

app.enableCors({
  origin: env.WEB_ORIGIN,
  credentials: true
});

await app.listen(env.PORT, "0.0.0.0");

console.log(`Local SEO API listening on http://localhost:${env.PORT}`);

