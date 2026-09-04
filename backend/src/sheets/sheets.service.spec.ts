import { ConfigService } from "@nestjs/config";
import type { Database } from "../database/database.module";
import { attendanceRecords, attendanceSessions, users } from "../database/schema";
import { SheetsService } from "./sheets.service";
import type { SheetsProvider } from "./sheets-provider.port";

type QueryChain = {
  from: (...args: unknown[]) => QueryChain;
  leftJoin: (...args: unknown[]) => QueryChain;
  innerJoin: (...args: unknown[]) => QueryChain;
  where: (...args: unknown[]) => QueryChain;
  limit: (...args: unknown[]) => QueryChain;
  orderBy: (...args: unknown[]) => QueryChain;
  then: <TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) => PromiseLike<TResult1 | TResult2>;
};

function query(result: unknown): QueryChain {
  const chain: QueryChain = {
    from: () => chain,
    leftJoin: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: () => chain,
    orderBy: () => chain,
    then: (onfulfilled, onrejected) => Promise.resolve(result).then(onfulfilled, onrejected),
  };
  return chain;
}

describe("SheetsService", () => {
  it("projects an open-registration participant into the attendance tab", async () => {
    const sessionId = "session-1";
    const user = {
      id: "user-1",
      fullName: "Ada Lovelace",
      normalizedEmail: "ada@example.com",
      normalizedPhone: "+2348012345678",
      participantSerial: "KSA-07",
      accountStatus: "ACTIVE",
      createdAt: new Date("2026-09-04T08:00:00.000Z"),
    } as unknown as typeof users.$inferSelect;
    const session = {
      id: sessionId,
      attendanceDate: "2026-09-04",
      status: "CLOSED",
      effectiveStartAt: new Date("2026-09-04T08:00:00.000Z"),
      effectiveEndAt: new Date("2026-09-04T11:00:00.000Z"),
    } as unknown as typeof attendanceSessions.$inferSelect;
    const record = {
      sessionId,
      userId: user.id,
      status: "PRESENT",
      method: "QR",
      checkedInAt: new Date("2026-09-04T08:30:00.000Z"),
    } as unknown as typeof attendanceRecords.$inferSelect;
    const results: unknown[] = [
      [session],
      [{ id: sessionId }],
      [{ id: "course-1", timezone: "Africa/Lagos", registrationMode: "OPEN_REGISTRATION" }],
      [record],
      [],
      [{ user }],
    ];
    const db = {
      select: jest.fn(() => query(results.shift())),
    } as unknown as Database;
    const provider = {
      replaceTabs: jest.fn().mockResolvedValue(undefined),
    } satisfies SheetsProvider;
    const service = new SheetsService(db, {} as never, provider, {} as never, new ConfigService());

    await service.syncSession(sessionId);

    const tabs = provider.replaceTabs.mock.calls[0]?.[0] as readonly {
      title: string;
      values: readonly (readonly string[])[];
    }[];
    expect(tabs[0]?.title).toBe("2026-09-04");
    expect(tabs[0]?.values[5]).toEqual([
      "KSA-07",
      "Ada Lovelace",
      "PRESENT",
      "QR",
      "2026-09-04T08:30:00.000Z",
      "2026-09-04",
      "OPEN_REGISTRATION",
    ]);
  });

  it("uses the complete projection for a Full rebuild", async () => {
    const service = new SheetsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new ConfigService(),
    );
    const syncFull = jest.spyOn(service, "syncFull").mockResolvedValue(undefined);

    await service.processJob("SHEETS_RECONCILE", { scope: "FULL" });

    expect(syncFull).toHaveBeenCalledTimes(1);
  });
});
