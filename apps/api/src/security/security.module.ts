import { Global, Module } from "@nestjs/common";
import { CsrfGuard } from "./csrf/csrf.guard.js";

@Global()
@Module({
  providers: [CsrfGuard],
  exports: [CsrfGuard]
})
export class SecurityModule {}
