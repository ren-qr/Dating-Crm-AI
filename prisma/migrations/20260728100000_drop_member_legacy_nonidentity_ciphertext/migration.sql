-- The prior migration copied every value into the plaintext business fields.
-- Only phone and ID-card values retain encrypted storage and lookup hashes.
ALTER TABLE "Member"
  DROP COLUMN "nameEncrypted",
  DROP COLUMN "birthDateEncrypted",
  DROP COLUMN "occupationEncrypted",
  DROP COLUMN "incomeRangeEncrypted",
  DROP COLUMN "housingStatusEncrypted",
  DROP COLUMN "vehicleStatusEncrypted",
  DROP COLUMN "hometownEncrypted",
  DROP COLUMN "currentCityEncrypted",
  DROP COLUMN "familyBackgroundEncrypted",
  DROP COLUMN "selfDescriptionEncrypted",
  DROP COLUMN "matePreferenceEncrypted";
