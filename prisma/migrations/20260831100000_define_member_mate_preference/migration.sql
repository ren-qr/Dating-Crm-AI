-- Replace the temporary free-text preference field with the confirmed first
-- version of the structured mate-preference model.
CREATE TYPE "GenderPreferenceMode" AS ENUM ('OPPOSITE', 'MALE', 'FEMALE', 'ANY', 'OTHER');

ALTER TABLE "MemberMatePreference"
  ADD COLUMN "ageMin" INTEGER,
  ADD COLUMN "ageMax" INTEGER,
  ADD COLUMN "genderPreference" "GenderPreferenceMode" NOT NULL DEFAULT 'OPPOSITE',
  ADD COLUMN "educationRequirement" TEXT,
  ADD COLUMN "incomeMinAnnual" INTEGER,
  ADD COLUMN "heightMinCm" INTEGER,
  ADD COLUMN "heightMaxCm" INTEGER,
  ADD COLUMN "maritalStatusRequirements" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "hasHousing" BOOLEAN,
  ADD COLUMN "hasVehicle" BOOLEAN,
  ADD COLUMN "smokingPreference" TEXT,
  ADD COLUMN "drinkingPreference" TEXT;

ALTER TABLE "MemberMatePreference" DROP COLUMN "preference";
