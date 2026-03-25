CREATE TABLE "article_content" (
	"id" serial PRIMARY KEY NOT NULL,
	"article_id" integer NOT NULL,
	"markdown" text NOT NULL,
	"metadata" jsonb,
	"scraped_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "article_content_article_id_unique" UNIQUE("article_id")
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"monitor_id" text NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"crawl_run_id" integer,
	CONSTRAINT "articles_monitor_id_url_unique" UNIQUE("monitor_id","url")
);
--> statement-breakpoint
CREATE TABLE "crawl_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"monitor_id" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"articles_found" integer DEFAULT 0 NOT NULL,
	"new_articles" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "listing_content" (
	"id" serial PRIMARY KEY NOT NULL,
	"crawl_run_id" integer NOT NULL,
	"markdown" text NOT NULL,
	"metadata" jsonb,
	"scraped_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "listing_content_crawl_run_id_unique" UNIQUE("crawl_run_id")
);
--> statement-breakpoint
CREATE TABLE "monitors" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"listing_url" text NOT NULL,
	"schedule" text NOT NULL,
	"extraction_prompt" text,
	"summary_prompt" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"article_id" integer NOT NULL,
	"summary_id" integer,
	"channel" text NOT NULL,
	"status" text NOT NULL,
	"slack_message_ts" text,
	"sent_at" timestamp,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scrape_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"monitor_id" text NOT NULL,
	"crawl_run_id" integer NOT NULL,
	"job_type" text NOT NULL,
	"urls" jsonb NOT NULL,
	"status" text NOT NULL,
	"completed_count" integer DEFAULT 0 NOT NULL,
	"total_count" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "scrape_jobs_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
CREATE TABLE "summaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"article_id" integer NOT NULL,
	"headline" text NOT NULL,
	"summary" text NOT NULL,
	"key_features" jsonb NOT NULL,
	"category" text NOT NULL,
	"relevance_score" integer,
	"llm_provider" text NOT NULL,
	"llm_model" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "summaries_article_id_unique" UNIQUE("article_id")
);
--> statement-breakpoint
ALTER TABLE "article_content" ADD CONSTRAINT "article_content_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_monitor_id_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."monitors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_crawl_run_id_crawl_runs_id_fk" FOREIGN KEY ("crawl_run_id") REFERENCES "public"."crawl_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawl_runs" ADD CONSTRAINT "crawl_runs_monitor_id_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."monitors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_content" ADD CONSTRAINT "listing_content_crawl_run_id_crawl_runs_id_fk" FOREIGN KEY ("crawl_run_id") REFERENCES "public"."crawl_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_summary_id_summaries_id_fk" FOREIGN KEY ("summary_id") REFERENCES "public"."summaries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_jobs" ADD CONSTRAINT "scrape_jobs_monitor_id_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."monitors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_jobs" ADD CONSTRAINT "scrape_jobs_crawl_run_id_crawl_runs_id_fk" FOREIGN KEY ("crawl_run_id") REFERENCES "public"."crawl_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summaries" ADD CONSTRAINT "summaries_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE no action ON UPDATE no action;