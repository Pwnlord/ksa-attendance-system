import { Controller, Get, HttpStatus } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../common/decorators/public.decorator";
import { AppError } from "../common/errors/app-error";
import { DatabaseHealthIndicator } from "./database-health.indicator";

@ApiTags("Operations")
@Controller("health")
@Public()
export class HealthController {
  constructor(private readonly databaseHealth: DatabaseHealthIndicator) {}

  @Get("live")
  @ApiOperation({ summary: "Return whether the API process is alive" })
  @ApiOkResponse({ description: "The API process is alive" })
  live(): { status: "ok"; service: string } {
    return { status: "ok", service: "ksa-attendance-backend" };
  }

  @Get("ready")
  @ApiOperation({ summary: "Return whether required backend dependencies are ready" })
  @ApiOkResponse({ description: "The API and database are ready" })
  async ready(): Promise<{ status: "ok"; checks: { database: "up" } }> {
    try {
      await this.databaseHealth.isHealthy();
      return { status: "ok", checks: { database: "up" } };
    } catch {
      throw new AppError(
        "SERVICE_TEMPORARILY_UNAVAILABLE",
        HttpStatus.SERVICE_UNAVAILABLE,
        "The service is not ready yet. Please try again shortly.",
        { dependency: "database" },
      );
    }
  }
}
