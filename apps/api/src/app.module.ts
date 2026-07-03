import { Module } from "@nestjs/common";
import { BetterAuthModule } from "./auth/better-auth/better-auth.module.js";
import { AuthzModule } from "./auth/authz.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { HealthController } from "./health.controller.js";
import { GscModule } from "./modules/gsc.module.js";
import { LeadsModule } from "./modules/leads.module.js";
import { OpportunitiesModule } from "./modules/opportunities.module.js";
import { ProjectsModule } from "./modules/projects.module.js";
import { QueueProducerModule } from "./queue-producer.js";
import { RedisModule } from "./redis/redis.module.js";
import { ReleasesModule } from "./modules/releases.module.js";
import { SecurityModule } from "./security/security.module.js";
import { TrackingModule } from "./modules/tracking.module.js";

@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    BetterAuthModule,
    AuthzModule,
    SecurityModule,
    QueueProducerModule,
    GscModule,
    LeadsModule,
    OpportunitiesModule,
    ProjectsModule,
    ReleasesModule,
    TrackingModule
  ],
  controllers: [HealthController]
})
export class AppModule {}
