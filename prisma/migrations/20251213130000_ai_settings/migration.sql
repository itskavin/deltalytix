-- CreateTable
CREATE TABLE "public"."AiSettings" (
    "id" TEXT NOT NULL,
    "authUserId" TEXT NOT NULL,
    "preferredProvider" TEXT NOT NULL DEFAULT 'openai',
    "geminiApiKeyEncrypted" TEXT,
    "geminiModel" TEXT NOT NULL DEFAULT 'gemini-flash-latest',
    "ollamaHostUrl" TEXT,
    "ollamaModel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiSettings_id_key" ON "public"."AiSettings"("id");

-- CreateIndex
CREATE UNIQUE INDEX "AiSettings_authUserId_key" ON "public"."AiSettings"("authUserId");

-- CreateIndex
CREATE INDEX "AiSettings_authUserId_idx" ON "public"."AiSettings"("authUserId");
