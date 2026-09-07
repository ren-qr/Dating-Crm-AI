-- Store a member's hobbies as unstructured text.
ALTER TABLE "MemberExtraProfile"
  ADD COLUMN IF NOT EXISTS "hobbies" TEXT;
