-- Test data has no retention value; replace free-form area strings with structured fields.
ALTER TABLE "Member"
  DROP COLUMN IF EXISTS "hometown",
  DROP COLUMN IF EXISTS "currentCity";

ALTER TABLE "Member"
  ADD COLUMN "hometownProvince" TEXT,
  ADD COLUMN "hometownCity" TEXT,
  ADD COLUMN "hometownDistrict" TEXT,
  ADD COLUMN "currentProvince" TEXT,
  ADD COLUMN "currentCity" TEXT,
  ADD COLUMN "currentDistrict" TEXT;
