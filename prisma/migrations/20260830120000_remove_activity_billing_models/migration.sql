-- Remove confirmed out-of-scope activity and billing models.
-- Existing data in these tables is test data and is intentionally discarded.
DROP TABLE IF EXISTS "CheckInRecord";
DROP TABLE IF EXISTS "ActivityRegistration";
DROP TABLE IF EXISTS "Activity";
DROP TABLE IF EXISTS "PaymentRecord";
DROP TABLE IF EXISTS "BillingOrder";
DROP TABLE IF EXISTS "MembershipPlan";

DROP TYPE IF EXISTS "CheckInStatus";
DROP TYPE IF EXISTS "RegistrationStatus";
DROP TYPE IF EXISTS "ActivityStatus";
DROP TYPE IF EXISTS "PaymentStatus";
DROP TYPE IF EXISTS "PaymentMethod";
DROP TYPE IF EXISTS "BillingOrderStatus";
DROP TYPE IF EXISTS "PlanStatus";
