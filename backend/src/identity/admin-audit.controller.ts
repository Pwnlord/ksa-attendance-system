import { Controller, Get, Query } from "@nestjs/common";
import { Roles } from "./decorators/roles.decorator";
import { AuditService } from "./audit.service";

@Controller("admin/audit")
@Roles("ADMIN")
export class AdminAuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query("limit") limit?: number, @Query("action") action?: string) {
    return this.audit.list(limit, action);
  }
}
