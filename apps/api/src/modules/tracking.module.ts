import { Body, Controller, Injectable, Module, Post } from "@nestjs/common";
import { TrackingEventSchema, type TrackingEvent } from "@localseo/contracts";

@Injectable()
class TrackingService {
  ingest(event: TrackingEvent) {
    return {
      accepted: true,
      eventName: event.eventName,
      occurredAt: event.occurredAt ?? new Date().toISOString()
    };
  }
}

@Controller("track")
class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  @Post()
  track(@Body() body: unknown) {
    const event = TrackingEventSchema.parse(body);
    return this.tracking.ingest(event);
  }
}

@Module({
  controllers: [TrackingController],
  providers: [TrackingService]
})
export class TrackingModule {}
