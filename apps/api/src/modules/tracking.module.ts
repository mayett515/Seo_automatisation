import { Body, Controller, Headers, Injectable, Module, Post, UnauthorizedException } from "@nestjs/common";
import { parseAppEnv } from "@localseo/config";
import {
  TrackingEventSchema,
  TrackingIngestResultSchema,
  type TrackingEvent,
  type TrackingIngestResult
} from "@localseo/contracts";

@Injectable()
export class TrackingService {
  ingest(event: TrackingEvent, trackingToken?: string): TrackingIngestResult {
    assertTrackingIngestAllowed(event, trackingToken);

    return TrackingIngestResultSchema.parse({
      accepted: true,
      eventName: event.eventName,
      occurredAt: event.occurredAt ?? new Date().toISOString()
    });
  }
}

@Controller("track")
class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  @Post()
  track(@Body() body: unknown, @Headers("x-tracking-token") trackingToken: string | string[] | undefined) {
    const event = TrackingEventSchema.parse(body);
    return this.tracking.ingest(event, readFirstHeader(trackingToken));
  }
}

@Module({
  controllers: [TrackingController],
  providers: [TrackingService]
})
export class TrackingModule {}

export function assertTrackingIngestAllowed(event: TrackingEvent, trackingToken: string | undefined): void {
  const env = parseAppEnv(process.env);

  if (event.projectId === "demo-project" && env.NODE_ENV !== "production") {
    return;
  }

  if (!isUuid(event.projectId) && env.NODE_ENV !== "production") {
    return;
  }

  if (!env.TRACKING_INGEST_TOKEN) {
    throw new UnauthorizedException("Tracking ingestion token is required for persisted project events.");
  }

  if (trackingToken !== env.TRACKING_INGEST_TOKEN) {
    throw new UnauthorizedException("Tracking ingestion token is invalid.");
  }
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
