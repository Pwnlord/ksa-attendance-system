import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { AuthRequestContext } from "../identity/decorators/current-user.decorator";
import { Roles } from "../identity/decorators/roles.decorator";
import { SheetsReconcileDto, SheetsRetryDto } from "./dto/sheets.dto";
import { SheetsService } from "./sheets.service";

@Controller("admin/sheets")
@Roles("ADMIN")
export class SheetsController {
  constructor(private readonly sheets: SheetsService) {}

  @Get("health")
  health() {
    return this.sheets.health().then((data) => ({ data }));
  }

  @Post("retry")
  @HttpCode(HttpStatus.ACCEPTED)
  retry(@CurrentUser() auth: AuthRequestContext, @Body() input: SheetsRetryDto) {
    return this.sheets.retry(auth.userId, input.jobIds);
  }

  @Post("reconcile")
  @HttpCode(HttpStatus.ACCEPTED)
  reconcile(
    @CurrentUser() auth: AuthRequestContext,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: SheetsReconcileDto,
  ) {
    return this.sheets.reconcile(auth.userId, input, idempotencyKey ?? "");
  }
}
