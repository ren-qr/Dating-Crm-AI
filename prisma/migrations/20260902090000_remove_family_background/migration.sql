-- Remove the deprecated family background field from the extra profile table.
ALTER TABLE "MemberExtraProfile" DROP COLUMN IF EXISTS "familyBackground";
