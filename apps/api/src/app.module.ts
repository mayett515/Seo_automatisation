import { Module } from "@nestjs/common";
import { BetterAuthModule } from "./auth/better-auth/better-auth.module.js";
import { AuthzModule } from "./auth/authz.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { HealthController } from "./health.controller.js";
import { GscModule } from "./modules/gsc.module.js";
import { LeadsModule } from "./modules/leads.module.js";
import { MediaModule } from "./modules/media.module.js";
import { OpportunitiesModule } from "./modules/opportunities.module.js";
import { PagesModule } from "./modules/pages.module.js";
import { ProjectsModule } from "./modules/projects.module.js";
import { QueueProducerModule } from "./queue-producer.js";
import { RedisModule } from "./redis/redis.module.js";
import { ReleasesModule } from "./modules/releases.module.js";
import { SecurityModule } from "./security/security.module.js";
import { TrackingModule } from "./modules/tracking.module.js";
import { MediaStorageModule } from "./media-storage.module.js";

@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    BetterAuthModule,
    AuthzModule,
    SecurityModule,
    QueueProducerModule,
    MediaStorageModule,
    GscModule,
    LeadsModule,
    MediaModule,
    OpportunitiesModule,
    PagesModule,
    ProjectsModule,
    ReleasesModule,
    TrackingModule
  ],
  controllers: [HealthController]
})
export class AppModule {}
