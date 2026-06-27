import { createHash, timingSafeEqual } from "node:crypto";
import {
  Body,
  Controller,
  Headers,
  Injectable,
  Module,
  Post,
  BadRequestException,
  UnauthorizedException
} from "@nestjs/common";
import { allowsLocalScaffoldAuth, parseAppEnv } from "@localseo/config";
import {
  TrackingEventSchema,
  TrackingIngestResultSchema,
  type TrackingEvent,
  type TrackingIngestResult
} from "@localseo/contracts";
import { projectTrackingKeys, trackingEvents } from "@localseo/db";
import { and, eq, isNull } from "drizzle-orm";
import { DatabaseService } from "../database/database.service.js";

@Injectable()
export class TrackingService {
  constructor(private readonly database: DatabaseService) {}

  async ingest(event: TrackingEvent, trackingKey?: string): Promise<TrackingIngestResult> {
    if (isLocalScaffoldEvent(event)) {
      return TrackingIngestResultSchema.parse({
        accepted: true,
        eventName: event.eventName,
        occurredAt: event.occurredAt ?? new Date().toISOString(),
        persisted: false,
        mode: "dry_run"
      });
    }

    if (!isUuid(event.projectId)) {
      throw new BadRequestException("Persisted tracking project id must be a UUID.");
    }

    const db = this.database.db;

    if (!db) {
      throw new UnauthorizedException("Tracking persistence is required for persisted project events.");
    }

    await this.assertProjectTrackingKey(event, trackingKey);

    const occurredAt = event.occurredAt ? new Date(event.occurredAt) : new Date();
    await db.insert(trackingEvents).values({
      projectId: event.projectId,
      eventName: event.eventName,
      route: event.route,
      componentId: event.componentId,
      occurredAt,
      metadataJson: {
        pageId: event.pageId
      }
    });

    return TrackingIngestResultSchema.parse({
      accepted: true,
      eventName: event.eventName,
      occurredAt: occurredAt.toISOString(),
      persisted: true,
      mode: "persisted"
    });
  }

  private async assertProjectTrackingKey(event: TrackingEvent, trackingKey: string | undefined): Promise<void> {
    if (!trackingKey) {
      throw new UnauthorizedException("Project tracking key is required for persisted project events.");
    }

    const db = this.database.db;

    if (!db) {
      throw new UnauthorizedException("Tracking persistence is required for persisted project events.");
    }

    const keyHash = hashTrackingKey(trackingKey);
    const [row] = await db
      .select({ id: projectTrackingKeys.id, keyHash: projectTrackingKeys.keyHash })
      .from(projectTrackingKeys)
      .where(
        and(
          eq(projectTrackingKeys.projectId, event.projectId),
          eq(projectTrackingKeys.status, "active"),
          eq(projectTrackingKeys.keyHash, keyHash),
          isNull(projectTrackingKeys.revokedAt)
        )
      )
      .limit(1);

    if (!row || !timingSafeStringEqual(row.keyHash, keyHash)) {
      throw new UnauthorizedException("Project tracking key is invalid.");
    }

    await db
      .update(projectTrackingKeys)
      .set({
        lastUsedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(projectTrackingKeys.id, row.id));
  }
}

@Controller("track")
class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  @Post()
  track(@Body() body: unknown, @Headers("x-tracking-key") trackingKey: string | string[] | undefined) {
    const event = TrackingEventSchema.parse(body);
    return this.tracking.ingest(event, readFirstHeader(trackingKey));
  }
}

@Module({
  controllers: [TrackingController],
  providers: [TrackingService]
})
export class TrackingModule {}

export function isLocalScaffoldEvent(event: TrackingEvent): boolean {
  const currentEnv = parseAppEnv(process.env);

  if (!allowsLocalScaffoldAuth(currentEnv)) {
    return false;
  }

  if (event.projectId === "demo-project") {
    return true;
  }

  if (!isUuid(event.projectId)) {
    return true;
  }

  return false;
}

function readFirstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value.find((item) => item.length > 0);
  }

  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

export function hashTrackingKey(trackingKey: string): string {
  return createHash("sha256").update(trackingKey).digest("base64url");
}

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
