import { ConfigService } from "@nestjs/config";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { AppError } from "../errors/app-error";
import { OriginGuard } from "./origin.guard";

function context(
  method: string,
  headers: Record<string, string> = {},
  cookies: Record<string, string> = {},
) {
  const request = {
    method,
    cookies,
    header(name: string) {
      return headers[name.toLowerCase()];
    },
  } as unknown as Request;
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe("OriginGuard", () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const config = new ConfigService({
    app: { trustedOrigins: ["https://attendance.example.test"], sessionCookieName: "session" },
  });
  const guard = new OriginGuard(reflector, config);

  beforeEach(() => jest.clearAllMocks());

  it("allows safe reads without an origin", () => {
    expect(guard.canActivate(context("GET"))).toBe(true);
  });

  it("allows an origin-less public request without a session cookie", () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(true);
    expect(guard.canActivate(context("POST"))).toBe(true);
  });

  it("requires a trusted origin for public requests with an untrusted origin", () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(true);
    expect(() => guard.canActivate(context("POST", { origin: "https://evil.example" }))).toThrow(
      "This request could not be verified",
    );
  });

  it("requires an origin for cookie-authenticated state changes", () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(false);
    expect(() => guard.canActivate(context("POST", {}, { session: "present" }))).toThrow(
      "This request could not be verified",
    );
  });

  it("allows trusted cookie-authenticated state changes", () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(false);
    expect(
      guard.canActivate(
        context("POST", { origin: "https://attendance.example.test" }, { session: "present" }),
      ),
    ).toBe(true);
  });

  it("uses a stable authorization error", () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(false);
    try {
      guard.canActivate(context("POST"));
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("ORIGIN_NOT_ALLOWED");
    }
  });
});
