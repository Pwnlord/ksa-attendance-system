export type Role = "PARTICIPANT" | "COURSE_REP" | "ADMIN";
export type SessionStatus = "DRAFT" | "SCHEDULED" | "OPEN" | "CLOSED" | "CANCELLED";
export type AttendanceStatus = "PRESENT" | "ABSENT" | "NOT_APPLICABLE";

export interface ParticipantSummary {
  id: string;
  fullName: string;
  serialNumber: string | null;
  status: "ACTIVE" | "DISABLED";
  roles: Role[];
}

export interface User {
  id: string;
  fullName: string;
  phone: string | null;
  email: string;
  serialNumber: string | null;
  roles: Role[];
  status: "ACTIVE" | "DISABLED";
  emailVerifiedAt: string | null;
  registeredAt: string;
}

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  participant: ParticipantSummary;
  status: "PRESENT";
  method: "QR" | "MANUAL";
  checkedInAt: string;
  approvedBy: { id: string } | null;
  locationStatus?: "VERIFIED" | "MANUAL" | "NOT_RETAINED";
}

export interface AttendanceContext {
  state: "NOT_OPEN" | "OPEN" | "CLOSED" | "ALREADY_PRESENT";
  session: AttendanceSession | null;
  attendanceRecord: AttendanceRecord | null;
  deviceStatus: "REGISTERED_BROWSER" | "UNRECOGNIZED_BROWSER" | "NO_ACTIVE_DEVICE";
}

export interface CheckInResult {
  outcome: string;
  serverTime: string;
  attemptId: string | null;
  manualRequestAllowed: boolean;
  attendanceRecord: AttendanceRecord | null;
  manualVerificationCase: ManualVerificationCase | null;
  deviceChangeRequest: DeviceChangeRequest | null;
}

export interface AttendanceSession {
  id: string;
  attendanceDate: string;
  effectiveStart: string;
  originalEffectiveEnd: string;
  effectiveEnd: string;
  timezone: string;
  status: SessionStatus;
  version: number;
  openedAt: string | null;
  openedBy: string | null;
  closedAt: string | null;
  closedBy: string | null;
  cancelledAt: string | null;
  extendedAt: string | null;
  extendedBy: string | null;
  reopenedAt: string | null;
  reopenCount: number;
  presentCount: number;
  createdAt: string;
}

export interface AttendanceHistoryEntry {
  sessionId: string;
  attendanceDate: string;
  sessionStatus: SessionStatus;
  attendanceStatus: AttendanceStatus;
  record: AttendanceRecord | null;
}

export interface ManualVerificationCase {
  id: string;
  participant: ParticipantSummary;
  sessionId: string;
  sourceAttemptId: string | null;
  creationSource: "AUTOMATIC_UNCERTAIN" | "PARTICIPANT_REQUEST" | "OPERATOR_EMERGENCY";
  reasonCode: string;
  participantReason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  requestedAt: string;
  expiresAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  decisionReason: string | null;
  photoAccessUrl?: string | null;
  attendanceRecord: AttendanceRecord | null;
  version: number;
}

export interface DeviceChangeRequest {
  id: string;
  participant: ParticipantSummary;
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUPERSEDED";
  requestedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  decisionReason: string | null;
  photoAccessUrl?: string | null;
  version: number;
}
