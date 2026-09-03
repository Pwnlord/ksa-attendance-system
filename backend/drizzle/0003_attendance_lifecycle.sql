ALTER TABLE "course_config" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
CREATE TYPE "registration_mode" AS ENUM ('PREAPPROVED_ROSTER', 'PILOT_FIRST_CLAIM_ADMIN_REVIEW');
--> statement-breakpoint
ALTER TABLE "course_config" ADD COLUMN "registration_mode" "registration_mode" DEFAULT 'PREAPPROVED_ROSTER' NOT NULL;
--> statement-breakpoint
ALTER TABLE "course_config" ADD COLUMN "failed_login_limit_per_15_minutes" integer DEFAULT 5 NOT NULL;
--> statement-breakpoint
ALTER TABLE "course_config" ADD COLUMN "password_reset_limit_per_hour" integer DEFAULT 3 NOT NULL;
--> statement-breakpoint
ALTER TABLE "course_config" ALTER COLUMN "registration_ip_limit_per_hour" SET DEFAULT 10;
--> statement-breakpoint
ALTER TABLE "course_config" ADD COLUMN "attendance_limit_per_minute" integer DEFAULT 10 NOT NULL;
--> statement-breakpoint
ALTER TABLE "course_config" ADD COLUMN "privileged_admin_limit_per_minute" integer DEFAULT 20 NOT NULL;
--> statement-breakpoint
UPDATE "course_config" SET "registration_ip_limit_per_hour" = 10 WHERE "registration_ip_limit_per_hour" = 50;
--> statement-breakpoint
ALTER TABLE "attendance_attempts" ALTER COLUMN "idempotency_key" TYPE varchar(200);
--> statement-breakpoint
ALTER TABLE "manual_verification_cases" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD COLUMN "cancelled_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD COLUMN "extended_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD COLUMN "extended_by_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD COLUMN "reopened_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD COLUMN "reopen_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "attendance_sessions"
  ADD CONSTRAINT "attendance_sessions_extended_by_user_id_users_id_fk"
  FOREIGN KEY ("extended_by_user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
