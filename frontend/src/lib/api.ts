import type {
  AttendanceContext,
  AttendanceHistoryEntry,
  AttendanceRecord,
  AttendanceSession,
  CheckInResult,
  DeviceChangeRequest,
  ManualVerificationCase,
  ParticipantSummary,
  User,
} from "./types";

const apiRoot = "/api/v1";

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details: Record<string, unknown> = {},
    readonly correlationId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}, acceptDataOnError = false): Promise<T> {
  const response = await fetch(`${apiRoot}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body instanceof FormData ? {} : { "content-type": "application/json" }),
      ...(init.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as {
    data?: T;
    error?: { code?: string; message?: string; details?: Record<string, unknown>; correlationId?: string };
  };
  if (!response.ok && acceptDataOnError && body.data !== undefined) return body.data as T;
  if (!response.ok) {
    throw new ApiError(
      body.error?.code ?? "REQUEST_FAILED",
      body.error?.message ?? "We could not complete that request.",
      response.status,
      body.error?.details ?? {},
      body.error?.correlationId,
    );
  }
  return ("data" in body ? body.data : body) as T;
}

const json = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

export const api = {
  session: () => request<{ user: User; attendanceDeviceStatus: string | null }>("/auth/session"),
  login: (identifier: string, password: string) =>
    request<{ user: User; attendanceDeviceStatus: string | null }>("/auth/login", {
      ...json({ identifier, password }),
    }),
  logout: () => request<void>("/auth/logout", json({})),
  forgotPassword: (identifier: string) => request<void>("/auth/password/forgot", json({ identifier })),
  confirmEmail: (token: string) => request<void>("/auth/email-verification/confirm", json({ token })),
  resetPassword: (token: string, password: string) => request<void>("/auth/password/reset", json({ token, password })),
  register: (form: FormData) => request<{ user: User; attendanceDeviceStatus: string | null }>("/auth/register", { method: "POST", body: form }),
  attendanceContext: () => request<AttendanceContext>("/attendance/context"),
  checkIn: (body: { location: { latitude: number; longitude: number; accuracyMetres: number; capturedAt: string } } | { locationFailure: "PERMISSION_DENIED" | "TIMEOUT" | "UNAVAILABLE" | "UNSUPPORTED" }, key: string) =>
    request<CheckInResult>("/attendance/check-in", {
      ...json(body),
      headers: { "Idempotency-Key": key },
    }, true),
  history: () => request<{ items: AttendanceHistoryEntry[]; nextCursor: string | null }>("/me/attendance"),
  manualCases: () => request<{ items: ManualVerificationCase[]; nextCursor: string | null }>("/me/manual-verifications"),
  manualRequest: (attemptId: string, reason: string, key: string) =>
    request<ManualVerificationCase>("/manual-verification-requests", {
      ...json({ attemptId, reason }),
      headers: { "Idempotency-Key": key },
    }),
  deviceStatus: () => request<{ browserStatus: string; pendingRequest: DeviceChangeRequest | null }>("/me/device"),
  deviceRequests: () => request<{ items: DeviceChangeRequest[] }>("/me/device-change-requests"),
  deviceRequest: (note?: string) => request<DeviceChangeRequest>("/me/device-change-requests", json({ note })),
  participants: (query: string) => request<{ items: ParticipantSummary[] }>(`/participants?query=${encodeURIComponent(query)}`),
  currentSession: () => request<AttendanceSession | null>("/sessions/current"),
  sessions: (status?: string) => request<{ items: AttendanceSession[] }>(`/sessions${status ? `?status=${status}` : ""}`),
  createSession: (body: { attendanceDate: string; effectiveStart: string; effectiveEnd?: string; initialStatus: "DRAFT" | "SCHEDULED" | "OPEN" }) =>
    request<AttendanceSession>("/sessions", json(body)),
  openSession: (sessionId: string, expectedVersion: number) =>
    request<AttendanceSession>(`/sessions/${sessionId}/open`, json({ expectedVersion })),
  closeSession: (sessionId: string, expectedVersion: number) =>
    request<AttendanceSession>(`/sessions/${sessionId}/close`, json({ expectedVersion })),
  extendSession: (sessionId: string, expectedVersion: number, effectiveEnd: string, reason: string) =>
    request<AttendanceSession>(`/sessions/${sessionId}/extend`, json({ expectedVersion, effectiveEnd, reason })),
  cancelSession: (sessionId: string, expectedVersion: number, reason: string) =>
    request<AttendanceSession>(`/sessions/${sessionId}/cancel`, json({ expectedVersion, reason })),
  emergencyAttendance: (participantId: string, sessionId: string, reason: string, key: string) =>
    request<AttendanceRecord>("/manual-verifications/emergency-attendance", {
      ...json({ participantId, sessionId, reason }),
      headers: { "Idempotency-Key": key },
    }),
  sessionAttendance: (sessionId: string, query?: string) =>
    request<{ items: AttendanceRecord[] }>(`/sessions/${sessionId}/attendance${query ? `?query=${encodeURIComponent(query)}` : ""}`),
  manualQueue: (status = "PENDING") => request<{ items: ManualVerificationCase[] }>(`/manual-verifications?status=${status}`),
  manualDetail: (caseId: string) => request<ManualVerificationCase>(`/manual-verifications/${caseId}`),
  manualDecision: (caseId: string, action: "approve" | "reject", expectedVersion: number, reason: string, key?: string) =>
    request<ManualVerificationCase>(`/manual-verifications/${caseId}/${action}`, {
      ...json({ expectedVersion, reason }),
      headers: key ? { "Idempotency-Key": key } : {},
    }),
  deviceQueue: (status = "PENDING") => request<{ items: DeviceChangeRequest[] }>(`/device-change-requests?status=${status}`),
  deviceDetail: (requestId: string) => request<DeviceChangeRequest>(`/device-change-requests/${requestId}`),
  deviceDecision: (requestId: string, action: "approve" | "reject", expectedVersion: number, reason: string, key?: string) =>
    request<DeviceChangeRequest>(`/device-change-requests/${requestId}/${action}`, {
      ...json({ expectedVersion, reason }),
      headers: key ? { "Idempotency-Key": key } : {},
    }),
  sheetsHealth: () => request<{ status: string; workerStatus: string; pendingCount: number; failedCount: number; lastSuccessfulSyncAt: string | null; lastSanitizedError: string | null; provider: string }>("/admin/sheets/health"),
  sheetsRetry: (jobIds?: string[]) => request<{ queuedCount: number; jobIds: string[] }>("/admin/sheets/retry", json({ jobIds })),
  sheetsReconcile: (scope: "MASTER_REGISTER" | "SESSION" | "SUMMARY" | "FULL", reason: string, key: string, sessionId?: string) =>
    request<{ jobId: string; status: string; scope: string }>("/admin/sheets/reconcile", {
      ...json({ scope, sessionId: sessionId ?? null, reason }),
      headers: { "Idempotency-Key": key },
    }),
};

export function newIdempotencyKey(prefix = "ksa-web") {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function apiErrorMessage(error: unknown, fallback = "Something went wrong. Please try again.") {
  return error instanceof ApiError ? error.message : fallback;
}
