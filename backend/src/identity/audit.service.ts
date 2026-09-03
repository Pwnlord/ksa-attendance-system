import { Inject, Injectable } from "@nestjs/common";
import { DATABASE } from "../database/database.constants";
import type { Database, DatabaseClient } from "../database/database.module";
import { auditEvents } from "../database/schema";

export interface AuditInput {
  actorUserId?: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId?: string;
  reason?: string;
  beforeValue?: Record<string, unknown>;
  afterValue?: Record<string, unknown>;
  correlationId?: string;
}

function safeValue(
  value: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!value) return undefined;
  const forbidden =
    /(password|hash|token|cookie|secret|credential|photo|coordinate|latitude|longitude)/i;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !forbidden.test(key))
      .slice(0, 50),
  );
}

@Injectable()
export class AuditService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async record(input: AuditInput): Promise<string> {
    return this.recordWith(this.db, input);
  }

  async recordWith(db: DatabaseClient, input: AuditInput): Promise<string> {
    const [event] = await db
      .insert(auditEvents)
      .values({
        actorUserId: input.actorUserId,
        actorRole: input.actorRole,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        beforeValue: safeValue(input.beforeValue),
        afterValue: safeValue(input.afterValue),
        correlationId: input.correlationId,
      })
      .returning({ id: auditEvents.id });
    if (!event) throw new Error("Audit event was not created.");
    return event.id;
  }
}
