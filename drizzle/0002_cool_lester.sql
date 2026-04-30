ALTER TABLE "articles" ADD COLUMN "title_normalized" text;--> statement-breakpoint
ALTER TABLE "crawl_runs" ADD COLUMN "failed_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "crawl_runs" ADD COLUMN "failure_summary" jsonb;--> statement-breakpoint
CREATE INDEX "articles_monitor_title_normalized_idx" ON "articles" USING btree ("monitor_id","title_normalized");