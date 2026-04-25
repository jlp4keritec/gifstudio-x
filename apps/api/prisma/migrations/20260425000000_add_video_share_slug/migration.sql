-- AlterTable : ajout shareSlug pour acces sans auth via lien
ALTER TABLE "video_assets" ADD COLUMN "share_slug" VARCHAR(32);

-- CreateIndex unique partiel : seuls les non-null sont uniques
CREATE UNIQUE INDEX "video_assets_share_slug_key" ON "video_assets"("share_slug") WHERE "share_slug" IS NOT NULL;
