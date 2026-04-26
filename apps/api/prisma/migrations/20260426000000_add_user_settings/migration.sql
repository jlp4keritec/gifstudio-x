-- CreateTable user_settings
-- 1 row par utilisateur (relation 1-1 avec users via user_id unique).
-- 'data' est un jsonb permettant d'y stocker n'importe quel preset
-- (ici on commence avec watermarkConfig, on en ajoutera d'autres ulterieurement).
CREATE TABLE "user_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_settings_user_id_key" ON "user_settings"("user_id");

ALTER TABLE "user_settings"
    ADD CONSTRAINT "user_settings_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
