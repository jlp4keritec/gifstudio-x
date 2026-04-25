-- CreateEnum
CREATE TYPE "CrawlerAdapter" AS ENUM ('reddit', 'redgifs', 'rule34', 'e621', 'generic_html');

-- CreateEnum
CREATE TYPE "CrawlerRunStatus" AS ENUM ('pending', 'running', 'success', 'failed');

-- CreateEnum
CREATE TYPE "CrawlerResultStatus" AS ENUM ('pending_review', 'approved', 'rejected', 'imported', 'import_failed');

-- CreateTable
CREATE TABLE "crawler_sources" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "adapter" "CrawlerAdapter" NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "cron_expression" VARCHAR(100) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "max_results_per_run" INTEGER NOT NULL DEFAULT 20,
    "last_run_at" TIMESTAMP(3),
    "last_run_status" "CrawlerRunStatus",
    "last_run_message" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crawler_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crawler_results" (
    "id" UUID NOT NULL,
    "crawler_source_id" UUID NOT NULL,
    "source_url" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "title" VARCHAR(500),
    "external_id" VARCHAR(255),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "status" "CrawlerResultStatus" NOT NULL DEFAULT 'pending_review',
    "rejected_at" TIMESTAMP(3),
    "imported_video_asset_id" UUID,
    "import_error_message" TEXT,
    "discovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crawler_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crawler_sources_adapter_idx" ON "crawler_sources"("adapter");
CREATE INDEX "crawler_sources_enabled_idx" ON "crawler_sources"("enabled");

-- CreateIndex : URL unique mais sauf si rejected (garde les anciens rejet pour historique, nouveau crawl possible)
CREATE UNIQUE INDEX "crawler_results_source_url_unique_not_rejected" ON "crawler_results"("source_url") WHERE "status" <> 'rejected';
CREATE INDEX "crawler_results_status_idx" ON "crawler_results"("status");
CREATE INDEX "crawler_results_crawler_source_id_idx" ON "crawler_results"("crawler_source_id");
CREATE INDEX "crawler_results_discovered_at_idx" ON "crawler_results"("discovered_at" DESC);

-- AddForeignKey
ALTER TABLE "crawler_sources" ADD CONSTRAINT "crawler_sources_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "crawler_results" ADD CONSTRAINT "crawler_results_crawler_source_id_fkey" FOREIGN KEY ("crawler_source_id") REFERENCES "crawler_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crawler_results" ADD CONSTRAINT "crawler_results_imported_video_asset_id_fkey" FOREIGN KEY ("imported_video_asset_id") REFERENCES "video_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
