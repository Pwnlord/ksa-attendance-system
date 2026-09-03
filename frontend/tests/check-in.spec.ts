import { expect, test } from "@playwright/test";

const participant = {
  id: "11111111-1111-4111-8111-111111111111",
  fullName: "Ada Participant",
  phone: "+2348000000000",
  email: "ada@example.test",
  serialNumber: "KSA-07",
  roles: ["PARTICIPANT"],
  status: "ACTIVE",
  emailVerifiedAt: null,
  registeredAt: "2026-09-03T08:00:00.000Z",
};

const session = {
  id: "22222222-2222-4222-8222-222222222222",
  attendanceDate: "2026-09-03",
  effectiveStart: "2026-09-03T08:00:00.000Z",
  originalEffectiveEnd: "2026-09-03T11:00:00.000Z",
  effectiveEnd: "2026-09-03T11:00:00.000Z",
  timezone: "Africa/Lagos",
  status: "OPEN",
  version: 1,
  openedAt: "2026-09-03T08:00:00.000Z",
  openedBy: "33333333-3333-4333-8333-333333333333",
  closedAt: null,
  closedBy: null,
  cancelledAt: null,
  extendedAt: null,
  extendedBy: null,
  reopenedAt: null,
  reopenCount: 0,
  presentCount: 0,
  createdAt: "2026-09-03T08:00:00.000Z",
};

test("logged-out check-in preserves the stable route", async ({ page }) => {
  await page.route("**/api/v1/auth/session", (route) => route.fulfill({
    status: 401,
    contentType: "application/json",
    body: JSON.stringify({ error: { code: "AUTHENTICATION_REQUIRED", message: "Please sign in." } }),
  }));

  await page.goto("/check-in");

  await expect(page).toHaveURL(/\/login\?returnTo=%2Fcheck-in/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("an authenticated participant receives success after the backend records check-in", async ({ page }) => {
  await page.route("**/api/v1/auth/session", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data: { user: participant, attendanceDeviceStatus: "REGISTERED_BROWSER" } }),
  }));
  await page.route("**/api/v1/attendance/context", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data: { state: "OPEN", session, attendanceRecord: null, deviceStatus: "REGISTERED_BROWSER" } }),
  }));
  await page.route("**/api/v1/attendance/check-in", async (route) => {
    expect(route.request().method()).toBe("POST");
    const body = route.request().postDataJSON() as { location?: { latitude: number; longitude: number } };
    expect(body.location?.latitude).toBe(6.5244);
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ data: { outcome: "ATTENDANCE_RECORDED", serverTime: "2026-09-03T08:30:00.000Z", attemptId: "44444444-4444-4444-8444-444444444444", manualRequestAllowed: false, attendanceRecord: null, manualVerificationCase: null, deviceChangeRequest: null } }),
    });
  });

  await page.context().grantPermissions(["geolocation"], { origin: "http://127.0.0.1:3107" });
  await page.context().setGeolocation({ latitude: 6.5244, longitude: 3.3792 });
  await page.goto("/check-in");

  await expect(page.getByRole("heading", { name: "You're present" })).toBeVisible();
  await expect(page.getByText("Attendance was recorded")).toBeVisible();
});
