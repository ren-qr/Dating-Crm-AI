-- CreateTable
CREATE TABLE "AiSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "provider" TEXT NOT NULL,
    "ollamaBaseUrl" TEXT NOT NULL,
    "ollamaModel" TEXT NOT NULL,
    "cloudBaseUrl" TEXT NOT NULL,
    "cloudModel" TEXT NOT NULL,
    "cloudApiKeyEncrypted" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSetting_pkey" PRIMARY KEY ("id")
);
