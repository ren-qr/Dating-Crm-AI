-- Remove remaining models explicitly marked for deletion.
-- These tables contain test data and are intentionally discarded.
DROP TABLE IF EXISTS "ReminderTask";
DROP TABLE IF EXISTS "RevenueSnapshot";
DROP TABLE IF EXISTS "CommissionLedger";
DROP TABLE IF EXISTS "ExportJob";
DROP TABLE IF EXISTS "MemberService";
DROP TABLE IF EXISTS "Finance";

DROP TYPE IF EXISTS "ReminderStatus";
DROP TYPE IF EXISTS "CommissionStatus";
DROP TYPE IF EXISTS "ExportJobStatus";
DROP TYPE IF EXISTS "ExportModule";
