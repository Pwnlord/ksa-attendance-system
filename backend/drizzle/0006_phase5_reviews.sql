ALTER TABLE "manual_verification_cases"
  ADD COLUMN "reason_code" varchar(64) DEFAULT 'LOCATION_UNCERTAIN' NOT NULL;
--> statement-breakpoint
ALTER TABLE "device_change_requests"
  ADD COLUMN "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "device_change_requests_one_pending_user_unique"
  ON "device_change_requests" USING btree ("user_id")
  WHERE "status" = 'PENDING';
