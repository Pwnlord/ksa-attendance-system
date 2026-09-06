import type { Request, Response } from "express";
import { AuthController } from "./auth.controller";

const deviceCookieName = "ksa_attendance_device";

function request(cookies: Record<string, string> = {}): Request {
  return {
    ip: "127.0.0.1",
    cookies,
    get: (name: string) => (name.toLowerCase() === "user-agent" ? "test-agent" : undefined),
  } as unknown as Request;
}

function dependencies() {
  const participant = {
    id: "participant-1",
    accountStatus: "ACTIVE",
  };
  const mocks = {
    registration: { register: jest.fn() },
    identity: { authenticate: jest.fn(), authenticatedEnvelope: jest.fn() },
    sessions: { create: jest.fn() },
    devices: { findByToken: jest.fn(), bindCreatedDevice: jest.fn(), browserStatus: jest.fn() },
    accountTokens: {},
    limits: { assertAllowed: jest.fn() },
    config: {
      getOrThrow: jest.fn((key: string) =>
        key === "app.attendanceDeviceCookieName" ? deviceCookieName : undefined,
      ),
    },
    courseConfig: {
      getRecord: jest.fn().mockResolvedValue({
        registrationIpLimitPerHour: 50,
        registrationIdentityLimitPerHour: 5,
      }),
    },
    roles: { hasAny: jest.fn() },
  };
  const controller = new AuthController(
    mocks.registration as never,
    mocks.identity as never,
    mocks.sessions as never,
    mocks.devices as never,
    mocks.accountTokens as never,
    mocks.limits as never,
    mocks.config as never,
    mocks.courseConfig as never,
    mocks.roles as never,
  );
  return { controller, mocks, participant };
}

describe("AuthController browser binding", () => {
  it("rejects registration when the browser is already assigned", async () => {
    const { controller, mocks } = dependencies();
    mocks.devices.findByToken.mockResolvedValue({
      id: "device-1",
      userId: "another-participant",
      status: "ACTIVE",
    });

    await expect(
      controller.register(
        {} as never,
        undefined,
        request({ [deviceCookieName]: "existing-device-token" }),
        {} as Response,
      ),
    ).rejects.toMatchObject({ code: "BROWSER_ASSIGNED_TO_OTHER_ACCOUNT" });
    expect(mocks.registration.register).not.toHaveBeenCalled();
    expect(mocks.limits.assertAllowed).not.toHaveBeenCalled();
  });

  it("creates the first account when the browser has no attendance binding", async () => {
    const { controller, mocks, participant } = dependencies();
    const device = { id: "device-1", userId: participant.id, rawCredential: "new-token" };
    mocks.devices.findByToken.mockResolvedValue(null);
    mocks.registration.register.mockResolvedValue({ userId: participant.id, device });
    mocks.identity.authenticatedEnvelope.mockResolvedValue({ data: { user: participant } });

    await controller.register(
      {
        fullName: "Ada Lovelace",
        phone: "+2348012345678",
        email: "ada@example.com",
        password: "password",
        serialNumber: "KSA-07",
      } as never,
      { buffer: Buffer.from("photo"), size: 5, mimetype: "image/jpeg" },
      request(),
      {} as Response,
    );

    expect(mocks.registration.register).toHaveBeenCalledTimes(1);
    expect(mocks.devices.bindCreatedDevice).toHaveBeenCalledWith({}, device);
    expect(mocks.sessions.create).toHaveBeenCalledWith(
      participant.id,
      { ipAddress: "127.0.0.1", userAgent: "test-agent" },
      {},
    );
  });

  it("rejects a different participant account on an assigned browser", async () => {
    const { controller, mocks, participant } = dependencies();
    mocks.identity.authenticate.mockResolvedValue(participant);
    mocks.roles.hasAny.mockResolvedValue(true);
    mocks.devices.findByToken.mockResolvedValue({
      id: "device-1",
      userId: "another-participant",
      status: "ACTIVE",
    });

    await expect(
      controller.login(
        { identifier: "KSA-07", password: "password" } as never,
        request({ [deviceCookieName]: "other-device-token" }),
        {} as Response,
      ),
    ).rejects.toMatchObject({ code: "BROWSER_ASSIGNED_TO_OTHER_ACCOUNT" });
    expect(mocks.sessions.create).not.toHaveBeenCalled();
  });

  it("allows the bound participant to log out and back in", async () => {
    const { controller, mocks, participant } = dependencies();
    mocks.identity.authenticate.mockResolvedValue(participant);
    mocks.roles.hasAny.mockResolvedValue(true);
    mocks.devices.findByToken.mockResolvedValue({
      id: "device-1",
      userId: participant.id,
      status: "ACTIVE",
    });
    mocks.devices.browserStatus.mockResolvedValue("REGISTERED_BROWSER");
    mocks.identity.authenticatedEnvelope.mockResolvedValue({ data: { user: participant } });

    await expect(
      controller.login(
        { identifier: "KSA-07", password: "password" } as never,
        request({ [deviceCookieName]: "participant-device-token" }),
        {} as Response,
      ),
    ).resolves.toEqual({ data: { user: participant } });
    expect(mocks.sessions.create).toHaveBeenCalledTimes(1);
  });
});
