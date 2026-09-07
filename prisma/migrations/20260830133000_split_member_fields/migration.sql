-- Split Member fields into dedicated tables. Existing data is test data and
-- can be discarded while the new architecture is established.
CREATE TABLE "MemberSensitiveInfo" (
  "id" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "phoneEncrypted" TEXT,
  "phoneHash" TEXT,
  "idCardEncrypted" TEXT,
  "idCardHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MemberSensitiveInfo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MemberSensitiveInfo_memberId_key" ON "MemberSensitiveInfo"("memberId");
CREATE INDEX "MemberSensitiveInfo_storeId_idx" ON "MemberSensitiveInfo"("storeId");
CREATE INDEX "MemberSensitiveInfo_storeId_phoneHash_idx" ON "MemberSensitiveInfo"("storeId", "phoneHash");
CREATE INDEX "MemberSensitiveInfo_storeId_idCardHash_idx" ON "MemberSensitiveInfo"("storeId", "idCardHash");
ALTER TABLE "MemberSensitiveInfo" ADD CONSTRAINT "MemberSensitiveInfo_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MemberMatePreference" (
  "id" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "preference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MemberMatePreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MemberMatePreference_memberId_key" ON "MemberMatePreference"("memberId");
CREATE INDEX "MemberMatePreference_storeId_idx" ON "MemberMatePreference"("storeId");
ALTER TABLE "MemberMatePreference" ADD CONSTRAINT "MemberMatePreference_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MemberExtraProfile" (
  "id" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "familyBackground" TEXT,
  "selfDescription" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MemberExtraProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MemberExtraProfile_memberId_key" ON "MemberExtraProfile"("memberId");
CREATE INDEX "MemberExtraProfile_storeId_idx" ON "MemberExtraProfile"("storeId");
ALTER TABLE "MemberExtraProfile" ADD CONSTRAINT "MemberExtraProfile_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Member" DROP COLUMN "phoneEncrypted";
ALTER TABLE "Member" DROP COLUMN "phoneHash";
ALTER TABLE "Member" DROP COLUMN "idCardEncrypted";
ALTER TABLE "Member" DROP COLUMN "idCardHash";
ALTER TABLE "Member" DROP COLUMN "source";
ALTER TABLE "Member" DROP COLUMN "blacklistedAt";
ALTER TABLE "Member" DROP COLUMN "familyBackground";
ALTER TABLE "Member" DROP COLUMN "selfDescription";
ALTER TABLE "Member" DROP COLUMN "matePreference";
