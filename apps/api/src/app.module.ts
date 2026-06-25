import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { LeadsModule } from "./modules/leads.module";
import { ProjectsModule } from "./modules/projects.module";
import { ReleasesModule } from "./modules/releases.module";
import { TrackingModule } from "./modules/tracking.module";

@Module({
  imports: [LeadsModule, ProjectsModule, ReleasesModule, TrackingModule],
  controllers: [HealthController]
})
export class AppModule {}

