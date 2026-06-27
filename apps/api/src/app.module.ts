import { Module } from "@nestjs/common";
import { BetterAuthModule } from "./auth/better-auth/better-auth.module.js";
import { AuthzModule } from "./auth/authz.module.js";
import { HealthController } from "./health.controller.js";
import { GscModule } from "./modules/gsc.module.js";
import { LeadsModule } from "./modules/leads.module.js";
import { ProjectsModule } from "./modules/projects.module.js";
import { QueueProducerModule } from "./queue-producer.js";
import { ReleasesModule } from "./modules/releases.module.js";
import { SecurityModule } from "./security/security.module.js";
import { TrackingModule } from "./modules/tracking.module.js";

@Module({
  imports: [
    BetterAuthModule,
    AuthzModule,
    SecurityModule,
    QueueProducerModule,
    GscModule,
    LeadsModule,
    ProjectsModule,
    ReleasesModule,
    TrackingModule
  ],
  controllers: [HealthController]
})
export class AppModule {}
