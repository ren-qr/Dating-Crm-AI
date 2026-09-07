CREATE TABLE "MemberService" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "memberId" TEXT,
    "operatorId" TEXT,
    "serviceType" TEXT NOT NULL,
    "status" TEXT,
    "sourceTable" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MemberService_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MemberService_sourceTable_sourceId_key" ON "MemberService"("sourceTable", "sourceId");
CREATE INDEX "MemberService_storeId_memberId_serviceType_createdAt_idx" ON "MemberService"("storeId", "memberId", "serviceType", "createdAt");
CREATE INDEX "MemberService_storeId_serviceType_status_idx" ON "MemberService"("storeId", "serviceType", "status");

CREATE TABLE "Finance" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "memberId" TEXT,
    "employeeId" TEXT,
    "recordType" TEXT NOT NULL,
    "sourceTable" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "amountCents" INTEGER,
    "status" TEXT,
    "payloadJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Finance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Finance_sourceTable_sourceId_key" ON "Finance"("sourceTable", "sourceId");
CREATE INDEX "Finance_storeId_recordType_createdAt_idx" ON "Finance"("storeId", "recordType", "createdAt");
CREATE INDEX "Finance_storeId_memberId_recordType_idx" ON "Finance"("storeId", "memberId", "recordType");
CREATE INDEX "Finance_storeId_employeeId_recordType_idx" ON "Finance"("storeId", "employeeId", "recordType");
