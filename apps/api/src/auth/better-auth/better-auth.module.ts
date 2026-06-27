import { Global, Module } from "@nestjs/common";
import { BetterAuthService } from "./better-auth.service.js";
import { BetterAuthGuard } from "../guards/better-auth.guard.js";

@Global()
@Module({
  providers: [BetterAuthService, BetterAuthGuard],
  exports: [BetterAuthService, BetterAuthGuard]
})
export class BetterAuthModule {}
