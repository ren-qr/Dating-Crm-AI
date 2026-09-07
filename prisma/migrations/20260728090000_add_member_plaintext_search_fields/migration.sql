-- Contact identity remains encrypted. The other profile fields are stored in
-- plaintext so that normal business filters can run inside PostgreSQL.
ALTER TABLE "Member"
  ADD COLUMN "name" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "birthDate" TEXT,
  ADD COLUMN "occupation" TEXT,
  ADD COLUMN "incomeRange" TEXT,
  ADD COLUMN "housingStatus" TEXT,
  ADD COLUMN "vehicleStatus" TEXT,
  ADD COLUMN "hometown" TEXT,
  ADD COLUMN "currentCity" TEXT,
  ADD COLUMN "familyBackground" TEXT,
  ADD COLUMN "selfDescription" TEXT,
  ADD COLUMN "matePreference" TEXT;

CREATE INDEX "Member_storeId_name_idx" ON "Member"("storeId", "name");
CREATE INDEX "Member_storeId_currentCity_education_idx" ON "Member"("storeId", "currentCity", "education");
CREATE INDEX "Member_storeId_occupation_idx" ON "Member"("storeId", "occupation");
