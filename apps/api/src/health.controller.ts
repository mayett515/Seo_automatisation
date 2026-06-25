import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: "ok",
      service: "local-seo-api",
      stack: {
        http: "NestJS/Fastify",
        workers: "BullMQ",
        ai: "Mastra"
      }
    };
  }
}

