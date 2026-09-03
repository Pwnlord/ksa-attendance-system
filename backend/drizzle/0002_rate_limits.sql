CREATE TABLE "rate_limit_buckets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "bucket_key" varchar(512) NOT NULL,
  "window_started_at" timestamp with time zone NOT NULL,
  "count" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limit_buckets_key_unique" ON "rate_limit_buckets" USING btree ("bucket_key");
