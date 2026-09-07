-- Stage 1 of MemberProfile consolidation.
-- This migration deliberately keeps MemberProfile and its relation intact.

ALTER TABLE "Member"
  ADD COLUMN "heightCm" INTEGER,
  ADD COLUMN "weightKg" INTEGER,
  ADD COLUMN "education" TEXT,
  ADD COLUMN "occupationEncrypted" TEXT,
  ADD COLUMN "incomeRangeEncrypted" TEXT,
  ADD COLUMN "maritalStatus" TEXT,
  ADD COLUMN "housingStatusEncrypted" TEXT,
  ADD COLUMN "vehicleStatusEncrypted" TEXT,
  ADD COLUMN "hometownEncrypted" TEXT,
  ADD COLUMN "currentCityEncrypted" TEXT,
  ADD COLUMN "familyBackgroundEncrypted" TEXT,
  ADD COLUMN "selfDescriptionEncrypted" TEXT,
  ADD COLUMN "matePreferenceEncrypted" TEXT,
  ADD COLUMN "profileCompletenessPercent" INTEGER NOT NULL DEFAULT 0;

-- Copy ciphertext byte-for-byte. No application key or decryption is involved.
UPDATE "Member" AS m
SET
  "heightCm" = p."heightCm",
  "weightKg" = p."weightKg",
  "education" = p."education",
  "occupationEncrypted" = p."occupationEncrypted",
  "incomeRangeEncrypted" = p."incomeRangeEncrypted",
  "maritalStatus" = p."maritalStatus",
  "housingStatusEncrypted" = p."housingStatusEncrypted",
  "vehicleStatusEncrypted" = p."vehicleStatusEncrypted",
  "hometownEncrypted" = p."hometownEncrypted",
  "currentCityEncrypted" = p."currentCityEncrypted",
  "familyBackgroundEncrypted" = p."familyBackgroundEncrypted",
  "selfDescriptionEncrypted" = p."selfDescriptionEncrypted",
  "matePreferenceEncrypted" = p."matePreferenceEncrypted",
  "profileCompletenessPercent" = p."profileCompletenessPercent"
FROM "MemberProfile" AS p
WHERE p."memberId" = m."id";
