import {
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull();

export const accountStatusEnum = pgEnum("account_status", ["ACTIVE", "SUSPENDED", "DISABLED"]);
export const roleEnum = pgEnum("role_name", ["PARTICIPANT", "COURSE_REP", "ADMIN"]);
export const rosterStatusEnum = pgEnum("roster_status", ["UNCLAIMED", "CLAIMED", "DISABLED"]);
export const sessionStatusEnum = pgEnum("attendance_session_status", [
  "DRAFT",
  "SCHEDULED",
  "OPEN",
  "CLOSED",
  "CANCELLED",
]);
export const registrationModeEnum = pgEnum("registration_mode", [
  "OPEN_REGISTRATION",
  "PREAPPROVED_ROSTER",
  "PILOT_FIRST_CLAIM_ADMIN_REVIEW",
]);
export const deviceStatusEnum = pgEnum("attendance_device_status", ["ACTIVE", "REVOKED"]);
export const deviceRequestStatusEnum = pgEnum("device_request_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "SUPERSEDED",
]);
export const photoStatusEnum = pgEnum("identification_photo_status", [
  "CANDIDATE",
  "ACTIVE",
  "SUPERSEDED",
  "PENDING_DELETION",
  "DELETED",
]);
export const photoRequestStatusEnum = pgEnum("photo_request_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "SUPERSEDED",
]);
export const attemptResultEnum = pgEnum("attendance_attempt_result", [
  "PASS",
  "DUPLICATE",
  "LOCATION_UNCERTAIN",
  "LOCATION_PERMISSION_DENIED",
  "LOCATION_TIMEOUT",
  "LOCATION_UNAVAILABLE",
  "LOCATION_UNSUPPORTED",
  "CLEARLY_REMOTE",
  "DEVICE_CHANGE_REQUIRED",
  "SESSION_NOT_OPEN",
  "SESSION_CLOSED",
  "AUTHENTICATION_REQUIRED",
  "NOT_A_PARTICIPANT",
]);
export const attendanceStatusEnum = pgEnum("attendance_record_status", [
  "PRESENT",
  "ABSENT",
  "NOT_APPLICABLE",
]);
export const attendanceMethodEnum = pgEnum("attendance_method", ["QR", "MANUAL", "CORRECTION"]);
export const manualCaseStatusEnum = pgEnum("manual_case_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
]);
export const manualCaseSourceEnum = pgEnum("manual_case_source", [
  "AUTOMATIC_UNCERTAIN",
  "PARTICIPANT_REQUEST",
  "EMERGENCY",
]);
export const jobStatusEnum = pgEnum("background_job_status", [
  "PENDING",
  "RUNNING",
  "RETRY_SCHEDULED",
  "SUCCEEDED",
  "FAILED",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fullName: varchar("full_name", { length: 200 }).notNull(),
    normalizedEmail: varchar("normalized_email", { length: 320 }),
    normalizedPhone: varchar("normalized_phone", { length: 32 }),
    passwordHash: text("password_hash").notNull(),
    participantSerial: varchar("participant_serial", { length: 6 }),
    accountStatus: accountStatusEnum("account_status").default("ACTIVE").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    emailUnique: uniqueIndex("users_normalized_email_unique").on(table.normalizedEmail),
    phoneUnique: uniqueIndex("users_normalized_phone_unique").on(table.normalizedPhone),
    serialUnique: uniqueIndex("users_participant_serial_unique").on(table.participantSerial),
  }),
);

export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex("email_verification_tokens_hash_unique").on(table.tokenHash),
    userIndex: index("email_verification_tokens_user_idx").on(table.userId, table.consumedAt),
  }),
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex("password_reset_tokens_hash_unique").on(table.tokenHash),
    userIndex: index("password_reset_tokens_user_idx").on(table.userId, table.consumedAt),
  }),
);

export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bucketKey: varchar("bucket_key", { length: 512 }).notNull(),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true, mode: "date" }).notNull(),
    count: integer("count").default(0).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    bucketKeyUnique: uniqueIndex("rate_limit_buckets_key_unique").on(table.bucketKey),
  }),
);

export const roleAssignments = pgTable(
  "role_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: roleEnum("role").notNull(),
    assignedAt: timestamp("assigned_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    assignedByUserId: uuid("assigned_by_user_id").references(() => users.id),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    revokedByUserId: uuid("revoked_by_user_id").references(() => users.id),
    reason: text("reason"),
  },
  (table) => ({
    userRoleIndex: index("role_assignments_user_idx").on(table.userId, table.role),
    activeCourseRepUnique: uniqueIndex("role_assignments_one_active_course_rep_idx")
      .on(table.role)
      .where(sql`${table.role} = 'COURSE_REP' AND ${table.revokedAt} IS NULL`),
  }),
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    createdAt: createdAt(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    idleExpiresAt: timestamp("idle_expires_at", { withTimezone: true, mode: "date" }).notNull(),
    absoluteExpiresAt: timestamp("absolute_expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    userAgentHash: varchar("user_agent_hash", { length: 64 }),
    ipHash: varchar("ip_hash", { length: 64 }),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex("auth_sessions_token_hash_unique").on(table.tokenHash),
    userIndex: index("auth_sessions_user_idx").on(table.userId, table.revokedAt),
  }),
);

export const courseConfig = pgTable(
  "course_config",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    singletonKey: varchar("singleton_key", { length: 32 }).default("default").notNull(),
    courseLabel: varchar("course_label", { length: 200 }).notNull(),
    timezone: varchar("timezone", { length: 64 }).default("Africa/Lagos").notNull(),
    registrationMode: registrationModeEnum("registration_mode")
      .default("OPEN_REGISTRATION")
      .notNull(),
    venueLatitude: numeric("venue_latitude", { precision: 10, scale: 7 }).notNull(),
    venueLongitude: numeric("venue_longitude", { precision: 10, scale: 7 }).notNull(),
    geofenceRadiusMeters: integer("geofence_radius_meters").default(200).notNull(),
    maxAutomaticAccuracyMeters: integer("max_automatic_accuracy_meters").default(150).notNull(),
    clearlyRemoteBoundaryMeters: integer("clearly_remote_boundary_meters").default(500).notNull(),
    locationFreshnessSeconds: integer("location_freshness_seconds").default(30).notNull(),
    locationTimeoutSeconds: integer("location_timeout_seconds").default(30).notNull(),
    defaultSessionDurationMinutes: integer("default_session_duration_minutes")
      .default(180)
      .notNull(),
    manualCaseGraceMinutes: integer("manual_case_grace_minutes").default(15).notNull(),
    photoRetentionDaysAfterCourse: integer("photo_retention_days_after_course")
      .default(90)
      .notNull(),
    failedLoginLimitPer15Minutes: integer("failed_login_limit_per_15_minutes").default(5).notNull(),
    passwordResetLimitPerHour: integer("password_reset_limit_per_hour").default(3).notNull(),
    registrationIpLimitPerHour: integer("registration_ip_limit_per_hour").default(50).notNull(),
    registrationIdentityLimitPerHour: integer("registration_identity_limit_per_hour")
      .default(5)
      .notNull(),
    attendanceLimitPerMinute: integer("attendance_limit_per_minute").default(10).notNull(),
    privilegedAdminLimitPerMinute: integer("privileged_admin_limit_per_minute")
      .default(20)
      .notNull(),
    onboardingOverrideExpiresAt: timestamp("onboarding_override_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    version: integer("version").default(1).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id),
  },
  (table) => ({
    singletonUnique: uniqueIndex("course_config_singleton_unique").on(table.singletonKey),
  }),
);

export const rosterEntries = pgTable(
  "roster_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    courseConfigId: uuid("course_config_id")
      .notNull()
      .references(() => courseConfig.id),
    serial: varchar("serial", { length: 6 }).notNull(),
    normalizedName: varchar("normalized_name", { length: 200 }).notNull(),
    normalizedEmail: varchar("normalized_email", { length: 320 }),
    normalizedPhone: varchar("normalized_phone", { length: 32 }),
    enrollmentEffectiveDate: date("enrollment_effective_date").notNull(),
    status: rosterStatusEnum("status").default("UNCLAIMED").notNull(),
    claimedUserId: uuid("claimed_user_id").references(() => users.id),
    claimedAt: timestamp("claimed_at", { withTimezone: true, mode: "date" }),
    importBatchId: uuid("import_batch_id"),
    version: integer("version").default(1).notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    courseSerialUnique: uniqueIndex("roster_entries_course_serial_unique").on(
      table.courseConfigId,
      table.serial,
    ),
    claimUserIndex: index("roster_entries_claimed_user_idx").on(table.claimedUserId),
  }),
);

export const attendanceDevices = pgTable(
  "attendance_devices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    credentialHash: varchar("credential_hash", { length: 64 }).notNull(),
    status: deviceStatusEnum("status").default("ACTIVE").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true, mode: "date" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    userAgentHash: varchar("user_agent_hash", { length: 64 }),
  },
  (table) => ({
    credentialHashUnique: uniqueIndex("attendance_devices_credential_hash_unique").on(
      table.credentialHash,
    ),
    userStatusIndex: index("attendance_devices_user_status_idx").on(table.userId, table.status),
    activeUserUnique: uniqueIndex("attendance_devices_one_active_per_user_idx")
      .on(table.userId)
      .where(sql`${table.status} = 'ACTIVE' AND ${table.revokedAt} IS NULL`),
  }),
);

export const attendanceSessions = pgTable(
  "attendance_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    courseConfigId: uuid("course_config_id")
      .notNull()
      .references(() => courseConfig.id),
    attendanceDate: date("attendance_date").notNull(),
    status: sessionStatusEnum("status").default("DRAFT").notNull(),
    originalStartAt: timestamp("original_start_at", { withTimezone: true, mode: "date" }).notNull(),
    originalEndAt: timestamp("original_end_at", { withTimezone: true, mode: "date" }).notNull(),
    effectiveStartAt: timestamp("effective_start_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    effectiveEndAt: timestamp("effective_end_at", { withTimezone: true, mode: "date" }).notNull(),
    version: integer("version").default(1).notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    openedByUserId: uuid("opened_by_user_id").references(() => users.id),
    closedByUserId: uuid("closed_by_user_id").references(() => users.id),
    createdAt: createdAt(),
    openedAt: timestamp("opened_at", { withTimezone: true, mode: "date" }),
    closedAt: timestamp("closed_at", { withTimezone: true, mode: "date" }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "date" }),
    extendedAt: timestamp("extended_at", { withTimezone: true, mode: "date" }),
    extendedByUserId: uuid("extended_by_user_id").references(() => users.id),
    reopenedAt: timestamp("reopened_at", { withTimezone: true, mode: "date" }),
    reopenCount: integer("reopen_count").default(0).notNull(),
    cancellationReason: text("cancellation_reason"),
    reopenReason: text("reopen_reason"),
  },
  (table) => ({
    dateIndex: index("attendance_sessions_date_idx").on(table.attendanceDate),
    statusIndex: index("attendance_sessions_status_idx").on(table.status),
    openCourseUnique: uniqueIndex("attendance_sessions_one_open_per_course_idx")
      .on(table.courseConfigId)
      .where(sql`${table.status} = 'OPEN'`),
  }),
);

export const attendanceAttempts = pgTable(
  "attendance_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    sessionId: uuid("session_id").references(() => attendanceSessions.id),
    attendanceDeviceId: uuid("attendance_device_id").references(() => attendanceDevices.id),
    receivedAt: timestamp("received_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    result: attemptResultEnum("result").notNull(),
    roundedDistanceMeters: integer("rounded_distance_meters"),
    reportedAccuracyMeters: numeric("reported_accuracy_meters", { precision: 10, scale: 2 }),
    locationOutcome: varchar("location_outcome", { length: 64 }),
    policyVersion: varchar("policy_version", { length: 32 }),
    idempotencyKey: varchar("idempotency_key", { length: 200 }),
    correlationId: varchar("correlation_id", { length: 128 }),
  },
  (table) => ({
    userReceivedIndex: index("attendance_attempts_user_received_idx").on(
      table.userId,
      table.receivedAt,
    ),
    idempotencyUnique: uniqueIndex("attendance_attempts_idempotency_unique").on(
      table.userId,
      table.idempotencyKey,
    ),
  }),
);

export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => attendanceSessions.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    status: attendanceStatusEnum("status").default("PRESENT").notNull(),
    method: attendanceMethodEnum("method").notNull(),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true, mode: "date" }).notNull(),
    sourceAttemptId: uuid("source_attempt_id").references(() => attendanceAttempts.id),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id),
    correctionReason: text("correction_reason"),
    correctedAt: timestamp("corrected_at", { withTimezone: true, mode: "date" }),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    sessionUserUnique: uniqueIndex("attendance_records_session_user_unique").on(
      table.sessionId,
      table.userId,
    ),
    sessionIndex: index("attendance_records_session_idx").on(table.sessionId, table.status),
    userIndex: index("attendance_records_user_idx").on(table.userId, table.checkedInAt),
  }),
);

export const manualVerificationCases = pgTable(
  "manual_verification_cases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => attendanceSessions.id),
    sourceAttemptId: uuid("source_attempt_id").references(() => attendanceAttempts.id),
    source: manualCaseSourceEnum("source").notNull(),
    status: manualCaseStatusEnum("status").default("PENDING").notNull(),
    reasonCode: varchar("reason_code", { length: 64 }).default("LOCATION_UNCERTAIN").notNull(),
    reason: text("reason"),
    reviewerUserId: uuid("reviewer_user_id").references(() => users.id),
    decisionReason: text("decision_reason"),
    version: integer("version").default(1).notNull(),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true, mode: "date" }),
  },
  (table) => ({
    userSessionIndex: index("manual_cases_user_session_idx").on(table.userId, table.sessionId),
    pendingUserSessionUnique: uniqueIndex("manual_cases_one_pending_user_session_unique")
      .on(table.userId, table.sessionId)
      .where(sql`${table.status} = 'PENDING'`),
  }),
);

export const identificationPhotos = pgTable(
  "identification_photos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    objectKey: varchar("object_key", { length: 512 }).notNull(),
    status: photoStatusEnum("status").default("CANDIDATE").notNull(),
    version: integer("version").notNull(),
    contentType: varchar("content_type", { length: 64 }).notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width"),
    height: integer("height"),
    checksum: varchar("checksum", { length: 128 }).notNull(),
    createdAt: createdAt(),
    approvedAt: timestamp("approved_at", { withTimezone: true, mode: "date" }),
    retentionDeleteAt: timestamp("retention_delete_at", { withTimezone: true, mode: "date" }),
  },
  (table) => ({
    objectKeyUnique: uniqueIndex("identification_photos_object_key_unique").on(table.objectKey),
    userVersionUnique: uniqueIndex("identification_photos_user_version_unique").on(
      table.userId,
      table.version,
    ),
    userStatusIndex: index("identification_photos_user_status_idx").on(table.userId, table.status),
  }),
);

export const deviceChangeRequests = pgTable(
  "device_change_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    candidateDeviceId: uuid("candidate_device_id")
      .notNull()
      .references(() => attendanceDevices.id),
    status: deviceRequestStatusEnum("status").default("PENDING").notNull(),
    requestReason: text("request_reason"),
    reviewerUserId: uuid("reviewer_user_id").references(() => users.id),
    decisionReason: text("decision_reason"),
    version: integer("version").default(1).notNull(),
    createdAt: createdAt(),
    decidedAt: timestamp("decided_at", { withTimezone: true, mode: "date" }),
  },
  (table) => ({
    userStatusIndex: index("device_change_requests_user_status_idx").on(table.userId, table.status),
    pendingUserUnique: uniqueIndex("device_change_requests_one_pending_user_unique")
      .on(table.userId)
      .where(sql`${table.status} = 'PENDING'`),
  }),
);

export const photoChangeRequests = pgTable(
  "photo_change_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    candidatePhotoId: uuid("candidate_photo_id")
      .notNull()
      .references(() => identificationPhotos.id),
    status: photoRequestStatusEnum("status").default("PENDING").notNull(),
    requestNote: text("request_note"),
    reviewerUserId: uuid("reviewer_user_id").references(() => users.id),
    decisionReason: text("decision_reason"),
    version: integer("version").default(1).notNull(),
    createdAt: createdAt(),
    decidedAt: timestamp("decided_at", { withTimezone: true, mode: "date" }),
  },
  (table) => ({
    userStatusIndex: index("photo_change_requests_user_status_idx").on(table.userId, table.status),
  }),
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    actorRole: varchar("actor_role", { length: 32 }).notNull(),
    action: varchar("action", { length: 128 }).notNull(),
    targetType: varchar("target_type", { length: 64 }).notNull(),
    targetId: uuid("target_id"),
    reason: text("reason"),
    beforeValue: jsonb("before_value"),
    afterValue: jsonb("after_value"),
    correlationId: varchar("correlation_id", { length: 128 }),
    createdAt: createdAt(),
  },
  (table) => ({
    targetIndex: index("audit_events_target_idx").on(
      table.targetType,
      table.targetId,
      table.createdAt,
    ),
    actorIndex: index("audit_events_actor_idx").on(table.actorUserId, table.createdAt),
  }),
);

export const backgroundJobs = pgTable(
  "background_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobType: varchar("job_type", { length: 128 }).notNull(),
    sourceKey: varchar("source_key", { length: 256 }).notNull(),
    payload: jsonb("payload").notNull(),
    status: jobStatusEnum("status").default("PENDING").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    runAfter: timestamp("run_after", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true, mode: "date" }),
    lockedBy: varchar("locked_by", { length: 128 }),
    lastError: varchar("last_error", { length: 500 }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => ({
    sourceKeyUnique: uniqueIndex("background_jobs_source_key_unique").on(table.sourceKey),
    claimIndex: index("background_jobs_claim_idx").on(table.status, table.runAfter),
  }),
);

export type User = typeof users.$inferSelect;
export type AuthSession = typeof authSessions.$inferSelect;
export type AttendanceDevice = typeof attendanceDevices.$inferSelect;
export type BackgroundJob = typeof backgroundJobs.$inferSelect;
