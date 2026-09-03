CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE TYPE "account_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');
--> statement-breakpoint
CREATE TYPE "role_name" AS ENUM ('PARTICIPANT', 'COURSE_REP', 'ADMIN');
--> statement-breakpoint
CREATE TYPE "roster_status" AS ENUM ('UNCLAIMED', 'CLAIMED', 'DISABLED');
--> statement-breakpoint
CREATE TYPE "attendance_session_status" AS ENUM ('DRAFT', 'SCHEDULED', 'OPEN', 'CLOSED', 'CANCELLED');
--> statement-breakpoint
CREATE TYPE "attendance_device_status" AS ENUM ('ACTIVE', 'REVOKED');
--> statement-breakpoint
CREATE TYPE "device_request_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED');
--> statement-breakpoint
CREATE TYPE "identification_photo_status" AS ENUM ('CANDIDATE', 'ACTIVE', 'SUPERSEDED', 'PENDING_DELETION', 'DELETED');
--> statement-breakpoint
CREATE TYPE "photo_request_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED');
--> statement-breakpoint
CREATE TYPE "attendance_attempt_result" AS ENUM ('PASS', 'DUPLICATE', 'LOCATION_UNCERTAIN', 'LOCATION_PERMISSION_DENIED', 'LOCATION_TIMEOUT', 'LOCATION_UNAVAILABLE', 'LOCATION_UNSUPPORTED', 'CLEARLY_REMOTE', 'DEVICE_CHANGE_REQUIRED', 'SESSION_NOT_OPEN', 'SESSION_CLOSED', 'AUTHENTICATION_REQUIRED', 'NOT_A_PARTICIPANT');
--> statement-breakpoint
CREATE TYPE "attendance_record_status" AS ENUM ('PRESENT', 'ABSENT', 'NOT_APPLICABLE');
--> statement-breakpoint
CREATE TYPE "attendance_method" AS ENUM ('QR', 'MANUAL', 'CORRECTION');
--> statement-breakpoint
CREATE TYPE "manual_case_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');
--> statement-breakpoint
CREATE TYPE "manual_case_source" AS ENUM ('AUTOMATIC_UNCERTAIN', 'PARTICIPANT_REQUEST', 'EMERGENCY');
--> statement-breakpoint
CREATE TYPE "background_job_status" AS ENUM ('PENDING', 'RUNNING', 'RETRY_SCHEDULED', 'SUCCEEDED', 'FAILED');
--> statement-breakpoint
CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "full_name" varchar(200) NOT NULL,
  "normalized_email" varchar(320),
  "normalized_phone" varchar(32),
  "password_hash" text NOT NULL,
  "participant_serial" varchar(6),
  "account_status" "account_status" DEFAULT 'ACTIVE' NOT NULL,
  "email_verified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "users_normalized_email_unique" ON "users" USING btree ("normalized_email");
--> statement-breakpoint
CREATE UNIQUE INDEX "users_normalized_phone_unique" ON "users" USING btree ("normalized_phone");
--> statement-breakpoint
CREATE UNIQUE INDEX "users_participant_serial_unique" ON "users" USING btree ("participant_serial");
--> statement-breakpoint
CREATE TABLE "role_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "role" "role_name" NOT NULL,
  "assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
  "assigned_by_user_id" uuid,
  "revoked_at" timestamp with time zone,
  "revoked_by_user_id" uuid,
  "reason" text,
  CONSTRAINT "role_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "role_assignments_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "role_assignments_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "role_assignments_user_idx" ON "role_assignments" USING btree ("user_id", "role");
--> statement-breakpoint
CREATE UNIQUE INDEX "role_assignments_one_active_course_rep_idx" ON "role_assignments" USING btree ("role") WHERE "role" = 'COURSE_REP' AND "revoked_at" IS NULL;
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "token_hash" varchar(64) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "idle_expires_at" timestamp with time zone NOT NULL,
  "absolute_expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "user_agent_hash" varchar(64),
  "ip_hash" varchar(64),
  CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_token_hash_unique" ON "auth_sessions" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id", "revoked_at");
--> statement-breakpoint
CREATE TABLE "course_config" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "singleton_key" varchar(32) DEFAULT 'default' NOT NULL,
  "course_label" varchar(200) NOT NULL,
  "timezone" varchar(64) DEFAULT 'Africa/Lagos' NOT NULL,
  "venue_latitude" numeric(10, 7) NOT NULL,
  "venue_longitude" numeric(10, 7) NOT NULL,
  "geofence_radius_meters" integer DEFAULT 200 NOT NULL,
  "max_automatic_accuracy_meters" integer DEFAULT 150 NOT NULL,
  "clearly_remote_boundary_meters" integer DEFAULT 500 NOT NULL,
  "location_freshness_seconds" integer DEFAULT 30 NOT NULL,
  "location_timeout_seconds" integer DEFAULT 10 NOT NULL,
  "default_session_duration_minutes" integer DEFAULT 180 NOT NULL,
  "manual_case_grace_minutes" integer DEFAULT 15 NOT NULL,
  "photo_retention_days_after_course" integer DEFAULT 90 NOT NULL,
  "registration_ip_limit_per_hour" integer DEFAULT 50 NOT NULL,
  "registration_identity_limit_per_hour" integer DEFAULT 5 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by_user_id" uuid,
  CONSTRAINT "course_config_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX "course_config_singleton_unique" ON "course_config" USING btree ("singleton_key");
--> statement-breakpoint
CREATE TABLE "roster_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "course_config_id" uuid NOT NULL,
  "serial" varchar(6) NOT NULL,
  "normalized_name" varchar(200) NOT NULL,
  "normalized_email" varchar(320),
  "normalized_phone" varchar(32),
  "enrollment_effective_date" date NOT NULL,
  "status" "roster_status" DEFAULT 'UNCLAIMED' NOT NULL,
  "claimed_user_id" uuid,
  "claimed_at" timestamp with time zone,
  "import_batch_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "roster_entries_course_config_id_course_config_id_fk" FOREIGN KEY ("course_config_id") REFERENCES "course_config"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "roster_entries_claimed_user_id_users_id_fk" FOREIGN KEY ("claimed_user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX "roster_entries_course_serial_unique" ON "roster_entries" USING btree ("course_config_id", "serial");
--> statement-breakpoint
CREATE INDEX "roster_entries_claimed_user_idx" ON "roster_entries" USING btree ("claimed_user_id");
--> statement-breakpoint
CREATE TABLE "attendance_devices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "credential_hash" varchar(64) NOT NULL,
  "status" "attendance_device_status" DEFAULT 'ACTIVE' NOT NULL,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "approved_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "user_agent_hash" varchar(64),
  CONSTRAINT "attendance_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_devices_credential_hash_unique" ON "attendance_devices" USING btree ("credential_hash");
--> statement-breakpoint
CREATE INDEX "attendance_devices_user_status_idx" ON "attendance_devices" USING btree ("user_id", "status");
--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_devices_one_active_per_user_idx" ON "attendance_devices" USING btree ("user_id") WHERE "status" = 'ACTIVE' AND "revoked_at" IS NULL;
--> statement-breakpoint
CREATE TABLE "attendance_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "course_config_id" uuid NOT NULL,
  "attendance_date" date NOT NULL,
  "status" "attendance_session_status" DEFAULT 'DRAFT' NOT NULL,
  "original_start_at" timestamp with time zone NOT NULL,
  "original_end_at" timestamp with time zone NOT NULL,
  "effective_start_at" timestamp with time zone NOT NULL,
  "effective_end_at" timestamp with time zone NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "opened_by_user_id" uuid,
  "closed_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "opened_at" timestamp with time zone,
  "closed_at" timestamp with time zone,
  "cancellation_reason" text,
  "reopen_reason" text,
  CONSTRAINT "attendance_sessions_course_config_id_course_config_id_fk" FOREIGN KEY ("course_config_id") REFERENCES "course_config"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "attendance_sessions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "attendance_sessions_opened_by_user_id_users_id_fk" FOREIGN KEY ("opened_by_user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "attendance_sessions_closed_by_user_id_users_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "attendance_sessions_date_idx" ON "attendance_sessions" USING btree ("attendance_date");
--> statement-breakpoint
CREATE INDEX "attendance_sessions_status_idx" ON "attendance_sessions" USING btree ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_sessions_one_open_per_course_idx" ON "attendance_sessions" USING btree ("course_config_id") WHERE "status" = 'OPEN';
--> statement-breakpoint
CREATE TABLE "attendance_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "session_id" uuid,
  "attendance_device_id" uuid,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  "result" "attendance_attempt_result" NOT NULL,
  "rounded_distance_meters" integer,
  "reported_accuracy_meters" numeric(10, 2),
  "location_outcome" varchar(64),
  "policy_version" varchar(32),
  "idempotency_key" varchar(128),
  "correlation_id" varchar(128),
  CONSTRAINT "attendance_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "attendance_attempts_session_id_attendance_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "attendance_sessions"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "attendance_attempts_attendance_device_id_attendance_devices_id_fk" FOREIGN KEY ("attendance_device_id") REFERENCES "attendance_devices"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "attendance_attempts_user_received_idx" ON "attendance_attempts" USING btree ("user_id", "received_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_attempts_idempotency_unique" ON "attendance_attempts" USING btree ("user_id", "idempotency_key");
--> statement-breakpoint
CREATE TABLE "attendance_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "status" "attendance_record_status" DEFAULT 'PRESENT' NOT NULL,
  "method" "attendance_method" NOT NULL,
  "checked_in_at" timestamp with time zone NOT NULL,
  "source_attempt_id" uuid,
  "approved_by_user_id" uuid,
  "correction_reason" text,
  "corrected_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "attendance_records_session_id_attendance_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "attendance_sessions"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "attendance_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "attendance_records_source_attempt_id_attendance_attempts_id_fk" FOREIGN KEY ("source_attempt_id") REFERENCES "attendance_attempts"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "attendance_records_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_records_session_user_unique" ON "attendance_records" USING btree ("session_id", "user_id");
--> statement-breakpoint
CREATE INDEX "attendance_records_session_idx" ON "attendance_records" USING btree ("session_id", "status");
--> statement-breakpoint
CREATE INDEX "attendance_records_user_idx" ON "attendance_records" USING btree ("user_id", "checked_in_at");
--> statement-breakpoint
CREATE TABLE "manual_verification_cases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "session_id" uuid NOT NULL,
  "source_attempt_id" uuid,
  "source" "manual_case_source" NOT NULL,
  "status" "manual_case_status" DEFAULT 'PENDING' NOT NULL,
  "reason" text,
  "reviewer_user_id" uuid,
  "decision_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "decided_at" timestamp with time zone,
  CONSTRAINT "manual_verification_cases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "manual_verification_cases_session_id_attendance_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "attendance_sessions"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "manual_verification_cases_source_attempt_id_attendance_attempts_id_fk" FOREIGN KEY ("source_attempt_id") REFERENCES "attendance_attempts"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "manual_verification_cases_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "manual_cases_user_session_idx" ON "manual_verification_cases" USING btree ("user_id", "session_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "manual_cases_one_pending_user_session_unique" ON "manual_verification_cases" USING btree ("user_id", "session_id") WHERE "status" = 'PENDING';
--> statement-breakpoint
CREATE TABLE "identification_photos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "object_key" varchar(512) NOT NULL,
  "status" "identification_photo_status" DEFAULT 'CANDIDATE' NOT NULL,
  "version" integer NOT NULL,
  "content_type" varchar(64) NOT NULL,
  "byte_size" integer NOT NULL,
  "width" integer,
  "height" integer,
  "checksum" varchar(128) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "approved_at" timestamp with time zone,
  "retention_delete_at" timestamp with time zone,
  CONSTRAINT "identification_photos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX "identification_photos_object_key_unique" ON "identification_photos" USING btree ("object_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "identification_photos_user_version_unique" ON "identification_photos" USING btree ("user_id", "version");
--> statement-breakpoint
CREATE INDEX "identification_photos_user_status_idx" ON "identification_photos" USING btree ("user_id", "status");
--> statement-breakpoint
CREATE TABLE "device_change_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "candidate_device_id" uuid NOT NULL,
  "status" "device_request_status" DEFAULT 'PENDING' NOT NULL,
  "request_reason" text,
  "reviewer_user_id" uuid,
  "decision_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "decided_at" timestamp with time zone,
  CONSTRAINT "device_change_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "device_change_requests_candidate_device_id_attendance_devices_id_fk" FOREIGN KEY ("candidate_device_id") REFERENCES "attendance_devices"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "device_change_requests_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "device_change_requests_user_status_idx" ON "device_change_requests" USING btree ("user_id", "status");
--> statement-breakpoint
CREATE TABLE "photo_change_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "candidate_photo_id" uuid NOT NULL,
  "status" "photo_request_status" DEFAULT 'PENDING' NOT NULL,
  "request_note" text,
  "reviewer_user_id" uuid,
  "decision_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "decided_at" timestamp with time zone,
  CONSTRAINT "photo_change_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "photo_change_requests_candidate_photo_id_identification_photos_id_fk" FOREIGN KEY ("candidate_photo_id") REFERENCES "identification_photos"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "photo_change_requests_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "photo_change_requests_user_status_idx" ON "photo_change_requests" USING btree ("user_id", "status");
--> statement-breakpoint
CREATE TABLE "audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_user_id" uuid,
  "actor_role" varchar(32) NOT NULL,
  "action" varchar(128) NOT NULL,
  "target_type" varchar(64) NOT NULL,
  "target_id" uuid,
  "reason" text,
  "before_value" jsonb,
  "after_value" jsonb,
  "correlation_id" varchar(128),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "audit_events_target_idx" ON "audit_events" USING btree ("target_type", "target_id", "created_at");
--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_user_id", "created_at");
--> statement-breakpoint
CREATE TABLE "background_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_type" varchar(128) NOT NULL,
  "source_key" varchar(256) NOT NULL,
  "payload" jsonb NOT NULL,
  "status" "background_job_status" DEFAULT 'PENDING' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "run_after" timestamp with time zone DEFAULT now() NOT NULL,
  "locked_at" timestamp with time zone,
  "locked_by" varchar(128),
  "last_error" varchar(500),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "background_jobs_source_key_unique" ON "background_jobs" USING btree ("source_key");
--> statement-breakpoint
CREATE INDEX "background_jobs_claim_idx" ON "background_jobs" USING btree ("status", "run_after");
