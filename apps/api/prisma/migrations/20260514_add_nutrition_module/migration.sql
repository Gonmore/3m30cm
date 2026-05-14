-- CreateEnum
CREATE TYPE "NutritionCategory" AS ENUM ('PRE_WORKOUT', 'POST_WORKOUT', 'REST_DAY', 'COMPETITION', 'SUPPLEMENTS');

-- CreateTable NutritionArticle
CREATE TABLE "NutritionArticle" (
    "id"          TEXT        NOT NULL,
    "title"       TEXT        NOT NULL,
    "category"    "NutritionCategory" NOT NULL,
    "content"     TEXT        NOT NULL,
    "icon"        TEXT        NOT NULL DEFAULT '🥗',
    "orderIndex"  INTEGER     NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN     NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable NutritionTip
CREATE TABLE "NutritionTip" (
    "id"        TEXT        NOT NULL,
    "message"   TEXT        NOT NULL,
    "isActive"  BOOLEAN     NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionTip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NutritionArticle_category_isPublished_idx" ON "NutritionArticle"("category", "isPublished");
