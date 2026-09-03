ALTER TABLE "course_config" ALTER COLUMN "registration_ip_limit_per_hour" SET DEFAULT 50;
--> statement-breakpoint
UPDATE "course_config" SET "registration_ip_limit_per_hour" = 50 WHERE "registration_ip_limit_per_hour" = 10;
