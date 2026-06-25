import { Module } from "@nestjs/common";
import { ProjectAccessGuard } from "./auth/project-access.guard.js";
import { HealthController } from "./health.controller.js";
import { GscModule } from "./modules/gsc.module.js";
import { LeadsModule } from "./modules/leads.module.js";
import { ProjectsModule } from "./modules/projects.module.js";
import { QueueProducerModule } from "./queue-producer.js";
import { ReleasesModule } from "./modules/releases.module.js";
import { TrackingModule } from "./modules/tracking.module.js";

@Module({
  imports: [QueueProducerModule, GscModule, LeadsModule, ProjectsModule, ReleasesModule, TrackingModule],
  controllers: [HealthController],
  providers: [ProjectAccessGuard]
})
export class AppModule {}
