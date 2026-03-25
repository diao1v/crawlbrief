ALTER TABLE "article_content" DROP CONSTRAINT "article_content_article_id_articles_id_fk";
--> statement-breakpoint
ALTER TABLE "articles" DROP CONSTRAINT "articles_monitor_id_monitors_id_fk";
--> statement-breakpoint
ALTER TABLE "articles" DROP CONSTRAINT "articles_crawl_run_id_crawl_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "crawl_runs" DROP CONSTRAINT "crawl_runs_monitor_id_monitors_id_fk";
--> statement-breakpoint
ALTER TABLE "listing_content" DROP CONSTRAINT "listing_content_crawl_run_id_crawl_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_article_id_articles_id_fk";
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_summary_id_summaries_id_fk";
--> statement-breakpoint
ALTER TABLE "scrape_jobs" DROP CONSTRAINT "scrape_jobs_monitor_id_monitors_id_fk";
--> statement-breakpoint
ALTER TABLE "scrape_jobs" DROP CONSTRAINT "scrape_jobs_crawl_run_id_crawl_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "summaries" DROP CONSTRAINT "summaries_article_id_articles_id_fk";
--> statement-breakpoint
ALTER TABLE "article_content" ADD CONSTRAINT "article_content_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_monitor_id_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."monitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_crawl_run_id_crawl_runs_id_fk" FOREIGN KEY ("crawl_run_id") REFERENCES "public"."crawl_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawl_runs" ADD CONSTRAINT "crawl_runs_monitor_id_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."monitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_content" ADD CONSTRAINT "listing_content_crawl_run_id_crawl_runs_id_fk" FOREIGN KEY ("crawl_run_id") REFERENCES "public"."crawl_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_summary_id_summaries_id_fk" FOREIGN KEY ("summary_id") REFERENCES "public"."summaries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_jobs" ADD CONSTRAINT "scrape_jobs_monitor_id_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."monitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_jobs" ADD CONSTRAINT "scrape_jobs_crawl_run_id_crawl_runs_id_fk" FOREIGN KEY ("crawl_run_id") REFERENCES "public"."crawl_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summaries" ADD CONSTRAINT "summaries_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;