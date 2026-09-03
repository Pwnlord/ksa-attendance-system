import { Inject, Injectable } from "@nestjs/common";
import type { Pool } from "pg";
import { DATABASE_POOL } from "../database/database.constants";

@Injectable()
export class DatabaseHealthIndicator {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async isHealthy(): Promise<boolean> {
    await this.pool.query("SELECT 1");
    return true;
  }
}
