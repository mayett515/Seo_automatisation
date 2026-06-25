import { Controller, Get } from "@nestjs/common";
import { parseAppEnv } from "@localseo/config";
import { HealthProbeResponseSchema, HealthResponseSchema, type HealthProbeResponse } from "@localseo/contracts";

const env = parseAppEnv(process.env);

@Controller("health")
export class HealthController {
  @Get()
  getHealth() {
    return HealthResponseSchema.parse({
      status: "ok",
      service: "local-seo-api",
      stack: {
        http: "NestJS/Fastify",
        workers: "BullMQ",
        ai: "Mastra"
      }
    });
  }

  @Get("live")
  getLive(): HealthProbeResponse {
    return HealthProbeResponseSchema.parse({
      ...this.getHealth(),
      probe: "liveness"
    });
  }

  @Get("ready")
  getReady(): HealthProbeResponse {
    const database = env.DATABASE_URL ? "configured" : "not_configured";
    const redis = env.REDIS_URL ? "configured" : "not_configured";
    const status = database === "configured" && redis === "configured" ? "ok" : "degraded";

    return HealthProbeResponseSchema.parse({
      ...this.getHealth(),
      status,
      probe: "readiness",
      dependencies: {
        database,
        redis
      }
    });
  }
}
