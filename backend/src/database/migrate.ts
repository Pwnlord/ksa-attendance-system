import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { validateEnvironment } from "../config/env.validation";

async function main(): Promise<void> {
  validateEnvironment(process.env);
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    application_name: "ksa-attendance-migrations",
  });

  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    console.log("Database migrations applied.");
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Database migration failed.");
  process.exitCode = 1;
});
