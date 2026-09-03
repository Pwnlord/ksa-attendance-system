import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, isNull, sql } from "drizzle-orm";
import { Pool } from "pg";
import { PasswordHasherService } from "../security/password/password-hasher.service";
import { validateEnvironment } from "../config/env.validation";
import { auditEvents, roleAssignments, users } from "../database/schema";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readPasswordFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function main(): Promise<void> {
  validateEnvironment(process.env);
  const email = argument("--email")?.trim().toLowerCase();
  const confirmation = argument("--confirm");
  if (!email || !email.includes("@") || confirmation !== "BOOTSTRAP_ADMIN") {
    throw new Error(
      "Usage: npm run bootstrap:admin -- --email admin@example.com --confirm BOOTSTRAP_ADMIN < password.txt",
    );
  }

  const password = await readPasswordFromStdin();
  if (password.length < 12)
    throw new Error("Bootstrap password must contain at least 12 characters.");

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    application_name: "ksa-attendance-bootstrap",
  });
  const db = drizzle(pool);
  const passwordHasher = new PasswordHasherService();

  try {
    const passwordHash = await passwordHasher.hash(password);
    const userId = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('ksa.bootstrap-admin'))`);
      const [existingAdmin] = await tx
        .select({ id: roleAssignments.id })
        .from(roleAssignments)
        .where(and(eq(roleAssignments.role, "ADMIN"), isNull(roleAssignments.revokedAt)))
        .limit(1);
      if (existingAdmin)
        throw new Error("An active Administrator already exists; bootstrap is one-time only.");

      const [user] = await tx
        .insert(users)
        .values({
          fullName: "Kora Sales Academy Administrator",
          normalizedEmail: email,
          passwordHash,
        })
        .returning({ id: users.id });
      if (!user) throw new Error("Bootstrap Administrator account was not created.");

      await tx.insert(roleAssignments).values({ userId: user.id, role: "ADMIN" });
      await tx.insert(auditEvents).values({
        actorRole: "SYSTEM",
        action: "BOOTSTRAP_ADMIN_CREATED",
        targetType: "USER",
        targetId: user.id,
        reason: "One-time deployment bootstrap",
        afterValue: { role: "ADMIN" },
      });
      return user.id;
    });

    console.log(`Bootstrap Administrator created: ${userId}`);
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Bootstrap failed.");
  process.exitCode = 1;
});
