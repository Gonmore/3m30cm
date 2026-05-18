-- Add welcomeVideoUrl to ProgramTemplate
ALTER TABLE "ProgramTemplate" ADD COLUMN "welcomeVideoUrl" TEXT;

-- Create MobileAppConfig table
CREATE TABLE "MobileAppConfig" (
    "id" TEXT NOT NULL,
    "appSlug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "templateCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MobileAppConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MobileAppConfig_appSlug_key" ON "MobileAppConfig"("appSlug");
