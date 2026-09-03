import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, eq, isNull } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import type { CookieOptions, Response } from "express";
import { DATABASE } from "../../database/database.constants";
import type { Database, DatabaseClient } from "../../database/database.module";
import { attendanceDevices } from "../../database/schema";

export interface DeviceContext {
  userAgent?: string;
}

export interface ActiveDevice {
  id: string;
  userId: string;
}

export type DeviceBrowserStatus =
  "REGISTERED_BROWSER" | "UNRECOGNIZED_BROWSER" | "NO_ACTIVE_DEVICE";

export interface CreatedDevice extends ActiveDevice {
  rawCredential: string;
}

export interface DeviceCredentialLookup {
  id: string;
  userId: string;
  status: "ACTIVE" | "REVOKED";
}

function hashValue(value: string | undefined): string | null {
  return value ? createHash("sha256").update(value).digest("hex") : null;
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

@Injectable()
export class DeviceCredentialService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly config: ConfigService,
  ) {}

  async createInitial(
    userId: string,
    context: DeviceContext,
    response: Response,
  ): Promise<ActiveDevice> {
    const device = await this.createInitialRecord(this.db, userId, context);
    this.setCookie(response, device.rawCredential);
    return { id: device.id, userId: device.userId };
  }

  async createInitialRecord(
    db: DatabaseClient,
    userId: string,
    context: DeviceContext,
  ): Promise<CreatedDevice> {
    const rawCredential = randomBytes(32).toString("base64url");
    const [device] = await db
      .insert(attendanceDevices)
      .values({
        userId,
        credentialHash: tokenHash(rawCredential),
        status: "ACTIVE",
        approvedAt: new Date(),
        userAgentHash: hashValue(context.userAgent),
      })
      .returning({ id: attendanceDevices.id, userId: attendanceDevices.userId });

    if (!device) throw new Error("Attendance device was not created.");
    return { ...device, rawCredential };
  }

  async createCandidateRecord(
    db: DatabaseClient,
    userId: string,
    context: DeviceContext,
  ): Promise<CreatedDevice> {
    const rawCredential = randomBytes(32).toString("base64url");
    const [device] = await db
      .insert(attendanceDevices)
      .values({
        userId,
        credentialHash: tokenHash(rawCredential),
        // A candidate is deliberately not usable for attendance until the
        // reviewer activates it in the same transaction as old-device revoke.
        status: "REVOKED",
        approvedAt: null,
        revokedAt: null,
        userAgentHash: hashValue(context.userAgent),
      })
      .returning({ id: attendanceDevices.id, userId: attendanceDevices.userId });

    if (!device) throw new Error("Attendance device candidate was not created.");
    return { ...device, rawCredential };
  }

  bindCreatedDevice(response: Response, device: CreatedDevice): void {
    this.setCookie(response, device.rawCredential);
  }

  async validateAndTouch(token: string | undefined): Promise<ActiveDevice | null> {
    if (!token) return null;
    const [device] = await this.db
      .select({ id: attendanceDevices.id, userId: attendanceDevices.userId })
      .from(attendanceDevices)
      .where(
        and(
          eq(attendanceDevices.credentialHash, tokenHash(token)),
          eq(attendanceDevices.status, "ACTIVE"),
          isNull(attendanceDevices.revokedAt),
        ),
      )
      .limit(1);
    if (!device) return null;

    await this.db
      .update(attendanceDevices)
      .set({ lastSeenAt: new Date() })
      .where(eq(attendanceDevices.id, device.id));
    return device;
  }

  async findByToken(token: string | undefined): Promise<DeviceCredentialLookup | null> {
    if (!token) return null;
    const [device] = await this.db
      .select({
        id: attendanceDevices.id,
        userId: attendanceDevices.userId,
        status: attendanceDevices.status,
      })
      .from(attendanceDevices)
      .where(eq(attendanceDevices.credentialHash, tokenHash(token)))
      .limit(1);
    return device ?? null;
  }

  async browserStatus(userId: string, token: string | undefined): Promise<DeviceBrowserStatus> {
    const current = await this.validateAndTouch(token);
    if (current?.userId === userId) return "REGISTERED_BROWSER";
    const [active] = await this.db
      .select({ id: attendanceDevices.id })
      .from(attendanceDevices)
      .where(
        and(
          eq(attendanceDevices.userId, userId),
          eq(attendanceDevices.status, "ACTIVE"),
          isNull(attendanceDevices.revokedAt),
        ),
      )
      .limit(1);
    return active ? "UNRECOGNIZED_BROWSER" : "NO_ACTIVE_DEVICE";
  }

  async revoke(token: string | undefined, response?: Response): Promise<void> {
    if (token) {
      await this.db
        .update(attendanceDevices)
        .set({ status: "REVOKED", revokedAt: new Date() })
        .where(eq(attendanceDevices.credentialHash, tokenHash(token)));
    }
    if (response)
      response.clearCookie(
        this.config.getOrThrow<string>("app.attendanceDeviceCookieName"),
        this.cookieOptions(0),
      );
  }

  private cookieOptions(maxAge: number): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get<boolean>("app.cookieSecure", false),
      sameSite: "lax",
      path: "/",
      // The server has no independent device-credential expiry; this only keeps
      // the browser credential across normal restarts until server-side revocation.
      maxAge: Math.max(0, Math.floor(maxAge)),
    };
  }

  private setCookie(response: Response, token: string): void {
    const tenYears = 10 * 365 * 24 * 60 * 60 * 1000;
    response.cookie(
      this.config.getOrThrow<string>("app.attendanceDeviceCookieName"),
      token,
      this.cookieOptions(tenYears),
    );
  }
}
