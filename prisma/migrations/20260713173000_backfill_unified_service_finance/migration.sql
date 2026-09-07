INSERT INTO "MemberService" ("id", "storeId", "memberId", "operatorId", "serviceType", "status", "sourceTable", "sourceId", "payloadJson", "createdAt", "updatedAt")
SELECT 'svc_' || "id", "storeId", "memberId", "uploadedById", 'document', "status"::text, 'MemberDocument', "id", to_jsonb("MemberDocument"), "createdAt", "updatedAt" FROM "MemberDocument"
UNION ALL SELECT 'svc_' || "id", "storeId", "initiatorMemberId", "ownerEmployeeId", 'match', "status"::text, 'MatchRecord', "id", to_jsonb("MatchRecord"), "createdAt", "updatedAt" FROM "MatchRecord"
UNION ALL SELECT 'svc_' || "id", "storeId", "memberId", "employeeId", 'followup', "type"::text, 'FollowUpRecord', "id", to_jsonb("FollowUpRecord"), "createdAt", "updatedAt" FROM "FollowUpRecord"
UNION ALL SELECT 'svc_' || "id", "storeId", NULL, "createdById", 'activity', "status"::text, 'Activity', "id", to_jsonb("Activity"), "createdAt", "updatedAt" FROM "Activity"
UNION ALL SELECT 'svc_' || "id", "storeId", "memberId", NULL, 'activity_registration', "status"::text, 'ActivityRegistration', "id", to_jsonb("ActivityRegistration"), "createdAt", "updatedAt" FROM "ActivityRegistration"
UNION ALL SELECT 'svc_' || "id", "storeId", NULL, NULL, 'checkin', "status"::text, 'CheckInRecord', "id", to_jsonb("CheckInRecord"), "createdAt", "updatedAt" FROM "CheckInRecord"
UNION ALL SELECT 'svc_' || "id", "storeId", "memberId", "assignedById", 'assignment', "status"::text, 'CustomerAssignment', "id", to_jsonb("CustomerAssignment"), "createdAt", "updatedAt" FROM "CustomerAssignment"
UNION ALL SELECT 'svc_' || "id", "storeId", "memberId", "createdById", 'blacklist', "status"::text, 'BlacklistEntry', "id", to_jsonb("BlacklistEntry"), "createdAt", "updatedAt" FROM "BlacklistEntry"
UNION ALL SELECT 'svc_' || "id", "storeId", "memberId", "createdById", 'reminder', "status"::text, 'ReminderTask', "id", to_jsonb("ReminderTask"), "createdAt", "updatedAt" FROM "ReminderTask";

INSERT INTO "Finance" ("id", "storeId", "memberId", "employeeId", "recordType", "sourceTable", "sourceId", "amountCents", "status", "payloadJson", "createdAt", "updatedAt")
SELECT 'fin_' || "id", "storeId", NULL, NULL, 'plan', 'MembershipPlan', "id", "priceCents", "status"::text, to_jsonb("MembershipPlan"), "createdAt", "updatedAt" FROM "MembershipPlan"
UNION ALL SELECT 'fin_' || "id", "storeId", "memberId", "createdById", 'billing_order', 'BillingOrder', "id", "payableAmountCents", "status"::text, to_jsonb("BillingOrder"), "createdAt", "updatedAt" FROM "BillingOrder"
UNION ALL SELECT 'fin_' || "id", "storeId", NULL, "receivedById", 'payment', 'PaymentRecord', "id", "amountCents", "status"::text, to_jsonb("PaymentRecord"), "createdAt", "updatedAt" FROM "PaymentRecord"
UNION ALL SELECT 'fin_' || "id", "storeId", NULL, NULL, 'revenue_snapshot', 'RevenueSnapshot', "id", "revenueCents", NULL, to_jsonb("RevenueSnapshot"), "createdAt", "updatedAt" FROM "RevenueSnapshot"
UNION ALL SELECT 'fin_' || "id", "storeId", "memberId", "employeeId", 'commission', 'CommissionLedger', "id", "commissionAmountCents", "status"::text, to_jsonb("CommissionLedger"), "createdAt", "updatedAt" FROM "CommissionLedger";
