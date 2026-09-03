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

export interface RosterEntry {
  id: string;
  serialNumber: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  enrollmentEffectiveDate: string;
  status: "UNCLAIMED" | "CLAIMED" | "DISABLED";
  claimedByUserId: string | null;
  claimedAt: string | null;
  version: number;
  createdAt: string;
}

export interface CourseConfig {
  courseLabel: string;
  timezone: string;
  registrationMode: "OPEN_REGISTRATION" | "PREAPPROVED_ROSTER" | "PILOT_FIRST_CLAIM_ADMIN_REVIEW";
  venueLatitude: number;
  venueLongitude: number;
  geofenceRadiusMetres: number;
  maxAutomaticAccuracyMetres: number;
  clearlyRemoteDistanceMetres: number;
  locationFreshnessSeconds: number;
  locationAcquisitionTimeoutSeconds: number;
  defaultSessionDurationMinutes: number;
  manualCaseGraceMinutes: number;
  photoRetentionDaysAfterCourse: number;
  rateLimits: {
    failedLoginPerAccountIpPer15Minutes: number;
    passwordResetPerEmailPerHour: number;
    registrationPerIpPerHour: number;
    registrationPerIdentityPerHour: number;
    attendancePerAccountPerMinute: number;
    privilegedAdminPerMinute: number;
    onboardingOverrideExpiresAt: string | null;
  };
  version: number;
}

export interface PhotoChangeRequest {
  id: string;
  participant: ParticipantSummary;
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUPERSEDED";
  note: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  decisionReason: string | null;
  currentPhotoAccessUrl: string | null;
  candidatePhotoAccessUrl: string | null;
  version: number;
}

export interface AuditEvent {
  id: string;
  actorUserId: string | null;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string | null;
  reason: string | null;
  beforeValue: Record<string, unknown> | null;
  afterValue: Record<string, unknown> | null;
  correlationId: string | null;
  createdAt: string;
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
  locationAcquisitionTimeoutSeconds: number;
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
