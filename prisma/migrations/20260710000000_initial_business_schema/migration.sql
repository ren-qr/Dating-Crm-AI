-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('LEAD', 'ACTIVE', 'MATCHING', 'PAUSED', 'MARRIED', 'REFUNDED', 'BLACKLISTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('ID_CARD', 'HOUSEHOLD_REGISTER', 'EDUCATION_CERTIFICATE', 'INCOME_CERTIFICATE', 'DIVORCE_CERTIFICATE', 'PHOTO', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('CANDIDATE', 'CONTACTING', 'DATING', 'SUCCESS', 'FAILED', 'CANCELLED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "FollowUpType" AS ENUM ('CALL', 'WECHAT', 'VISIT', 'DATE_FEEDBACK', 'COMPLAINT', 'RETURN_VISIT', 'OTHER');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('REGISTERED', 'CANCELLED', 'CHECKED_IN', 'NO_SHOW', 'BLOCKED');

-- CreateEnum
CREATE TYPE "CheckInStatus" AS ENUM ('CHECKED_IN', 'REVOKED');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "BillingOrderStatus" AS ENUM ('DRAFT', 'PENDING', 'PAID', 'CANCELLED', 'REFUNDED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'WECHAT_PAY', 'ALIPAY', 'BANK_TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'TRANSFERRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BlacklistStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BlacklistSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'DONE', 'CANCELLED', 'SNOOZED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'EXPORT', 'IMPORT', 'ASSIGN', 'MATCH', 'CHECK_IN', 'PAYMENT', 'BLACKLIST_BLOCK', 'UPLOAD');

-- CreateEnum
CREATE TYPE "ExportJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExportModule" AS ENUM ('MEMBERS', 'MATCHES', 'FOLLOWUPS', 'ACTIVITIES', 'BILLING', 'FINANCE', 'STAFF', 'CUSTOMERS', 'COMMISSIONS', 'BLACKLISTS', 'REMINDERS', 'AUDITS');

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phoneEncrypted" TEXT,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL DEFAULT 'GLOBAL',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffRole" (
    "employeeId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffRole_pkey" PRIMARY KEY ("employeeId","roleId")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "ownerEmployeeId" TEXT NOT NULL,
    "memberNo" TEXT NOT NULL,
    "nameEncrypted" TEXT NOT NULL,
    "gender" "Gender" NOT NULL DEFAULT 'UNKNOWN',
    "birthDateEncrypted" TEXT,
    "phoneEncrypted" TEXT,
    "phoneHash" TEXT,
    "idCardEncrypted" TEXT,
    "idCardHash" TEXT,
    "status" "MemberStatus" NOT NULL DEFAULT 'LEAD',
    "source" TEXT,
    "blacklistedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberProfile" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "heightCm" INTEGER,
    "weightKg" INTEGER,
    "education" TEXT,
    "occupationEncrypted" TEXT,
    "incomeRangeEncrypted" TEXT,
    "maritalStatus" TEXT,
    "housingStatusEncrypted" TEXT,
    "vehicleStatusEncrypted" TEXT,
    "hometownEncrypted" TEXT,
    "currentCityEncrypted" TEXT,
    "familyBackgroundEncrypted" TEXT,
    "selfDescriptionEncrypted" TEXT,
    "matePreferenceEncrypted" TEXT,
    "profileCompletenessPercent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberDocument" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "storageKeyEncrypted" TEXT NOT NULL,
    "fileNameEncrypted" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "checksumHash" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "rejectReason" TEXT,
    "uploadedById" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchRecord" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "initiatorMemberId" TEXT NOT NULL,
    "candidateMemberId" TEXT NOT NULL,
    "ownerEmployeeId" TEXT NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'CANDIDATE',
    "score" INTEGER,
    "reasonSummary" TEXT,
    "manualNote" TEXT,
    "blockedByBlacklist" BOOLEAN NOT NULL DEFAULT false,
    "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "successAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUpRecord" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "matchId" TEXT,
    "employeeId" TEXT NOT NULL,
    "type" "FollowUpType" NOT NULL,
    "content" TEXT NOT NULL,
    "nextAction" TEXT,
    "nextAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUpRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ActivityStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "capacity" INTEGER,
    "feeAmountCents" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityRegistration" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'REGISTERED',
    "blockedByBlacklist" BOOLEAN NOT NULL DEFAULT false,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckInRecord" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "status" "CheckInStatus" NOT NULL DEFAULT 'CHECKED_IN',
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckInRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipPlan" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "durationDays" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "commissionRateBps" INTEGER NOT NULL DEFAULT 0,
    "status" "PlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingOrder" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "planId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "payableAmountCents" INTEGER NOT NULL,
    "paidAmountCents" INTEGER NOT NULL DEFAULT 0,
    "status" "BillingOrderStatus" NOT NULL DEFAULT 'PENDING',
    "blockedByBlacklist" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRecord" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "billingOrderId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "transactionNoHash" TEXT,
    "receivedById" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevenueSnapshot" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "newMemberCount" INTEGER NOT NULL DEFAULT 0,
    "matchSuccessCount" INTEGER NOT NULL DEFAULT 0,
    "activityCheckInCount" INTEGER NOT NULL DEFAULT 0,
    "revenueCents" INTEGER NOT NULL DEFAULT 0,
    "commissionCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevenueSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAssignment" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "assigneeEmployeeId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionLedger" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "memberId" TEXT,
    "billingOrderId" TEXT,
    "baseAmountCents" INTEGER NOT NULL,
    "commissionAmountCents" INTEGER NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "calculatedById" TEXT,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlacklistEntry" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "memberId" TEXT,
    "phoneHash" TEXT,
    "idCardHash" TEXT,
    "reason" TEXT NOT NULL,
    "severity" "BlacklistSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "BlacklistStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlacklistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderTask" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "memberId" TEXT,
    "assigneeEmployeeId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReminderTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "actorEmployeeId" TEXT,
    "action" "AuditAction" NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "requestId" TEXT NOT NULL,
    "beforeHash" TEXT,
    "afterHash" TEXT,
    "metadataJson" JSONB,
    "ipHash" TEXT,
    "userAgentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportJob" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "module" "ExportModule" NOT NULL,
    "status" "ExportJobStatus" NOT NULL DEFAULT 'PENDING',
    "filtersJson" JSONB,
    "dateFrom" TIMESTAMP(3),
    "dateTo" TIMESTAMP(3),
    "fileKeyEncrypted" TEXT,
    "fileNameEncrypted" TEXT,
    "downloadTokenHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PermissionToRole" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PermissionToRole_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "Employee_storeId_status_idx" ON "Employee"("storeId", "status");

-- CreateIndex
CREATE INDEX "Employee_createdById_idx" ON "Employee"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_storeId_email_key" ON "Employee"("storeId", "email");

-- CreateIndex
CREATE INDEX "Role_storeId_idx" ON "Role"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_storeId_code_key" ON "Role"("storeId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE INDEX "StaffRole_storeId_idx" ON "StaffRole"("storeId");

-- CreateIndex
CREATE INDEX "StaffRole_roleId_idx" ON "StaffRole"("roleId");

-- CreateIndex
CREATE INDEX "Member_storeId_ownerEmployeeId_status_idx" ON "Member"("storeId", "ownerEmployeeId", "status");

-- CreateIndex
CREATE INDEX "Member_storeId_phoneHash_idx" ON "Member"("storeId", "phoneHash");

-- CreateIndex
CREATE INDEX "Member_storeId_idCardHash_idx" ON "Member"("storeId", "idCardHash");

-- CreateIndex
CREATE INDEX "Member_createdAt_idx" ON "Member"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Member_storeId_memberNo_key" ON "Member"("storeId", "memberNo");

-- CreateIndex
CREATE UNIQUE INDEX "MemberProfile_memberId_key" ON "MemberProfile"("memberId");

-- CreateIndex
CREATE INDEX "MemberProfile_storeId_idx" ON "MemberProfile"("storeId");

-- CreateIndex
CREATE INDEX "MemberProfile_storeId_education_idx" ON "MemberProfile"("storeId", "education");

-- CreateIndex
CREATE INDEX "MemberDocument_storeId_memberId_idx" ON "MemberDocument"("storeId", "memberId");

-- CreateIndex
CREATE INDEX "MemberDocument_storeId_documentType_status_idx" ON "MemberDocument"("storeId", "documentType", "status");

-- CreateIndex
CREATE INDEX "MemberDocument_checksumHash_idx" ON "MemberDocument"("checksumHash");

-- CreateIndex
CREATE INDEX "MatchRecord_storeId_status_matchedAt_idx" ON "MatchRecord"("storeId", "status", "matchedAt");

-- CreateIndex
CREATE INDEX "MatchRecord_storeId_ownerEmployeeId_idx" ON "MatchRecord"("storeId", "ownerEmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchRecord_storeId_initiatorMemberId_candidateMemberId_key" ON "MatchRecord"("storeId", "initiatorMemberId", "candidateMemberId");

-- CreateIndex
CREATE INDEX "FollowUpRecord_storeId_memberId_createdAt_idx" ON "FollowUpRecord"("storeId", "memberId", "createdAt");

-- CreateIndex
CREATE INDEX "FollowUpRecord_storeId_employeeId_nextAt_idx" ON "FollowUpRecord"("storeId", "employeeId", "nextAt");

-- CreateIndex
CREATE INDEX "FollowUpRecord_matchId_idx" ON "FollowUpRecord"("matchId");

-- CreateIndex
CREATE INDEX "Activity_storeId_status_startsAt_idx" ON "Activity"("storeId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "Activity_createdById_idx" ON "Activity"("createdById");

-- CreateIndex
CREATE INDEX "ActivityRegistration_storeId_status_registeredAt_idx" ON "ActivityRegistration"("storeId", "status", "registeredAt");

-- CreateIndex
CREATE INDEX "ActivityRegistration_storeId_memberId_idx" ON "ActivityRegistration"("storeId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityRegistration_activityId_memberId_key" ON "ActivityRegistration"("activityId", "memberId");

-- CreateIndex
CREATE INDEX "CheckInRecord_storeId_checkedInAt_idx" ON "CheckInRecord"("storeId", "checkedInAt");

-- CreateIndex
CREATE INDEX "CheckInRecord_registrationId_idx" ON "CheckInRecord"("registrationId");

-- CreateIndex
CREATE INDEX "MembershipPlan_storeId_status_idx" ON "MembershipPlan"("storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipPlan_storeId_code_key" ON "MembershipPlan"("storeId", "code");

-- CreateIndex
CREATE INDEX "BillingOrder_storeId_memberId_status_idx" ON "BillingOrder"("storeId", "memberId", "status");

-- CreateIndex
CREATE INDEX "BillingOrder_storeId_createdAt_idx" ON "BillingOrder"("storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingOrder_storeId_orderNo_key" ON "BillingOrder"("storeId", "orderNo");

-- CreateIndex
CREATE INDEX "PaymentRecord_storeId_billingOrderId_idx" ON "PaymentRecord"("storeId", "billingOrderId");

-- CreateIndex
CREATE INDEX "PaymentRecord_storeId_status_paidAt_idx" ON "PaymentRecord"("storeId", "status", "paidAt");

-- CreateIndex
CREATE INDEX "PaymentRecord_transactionNoHash_idx" ON "PaymentRecord"("transactionNoHash");

-- CreateIndex
CREATE INDEX "RevenueSnapshot_snapshotDate_idx" ON "RevenueSnapshot"("snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "RevenueSnapshot_storeId_snapshotDate_key" ON "RevenueSnapshot"("storeId", "snapshotDate");

-- CreateIndex
CREATE INDEX "CustomerAssignment_storeId_memberId_status_idx" ON "CustomerAssignment"("storeId", "memberId", "status");

-- CreateIndex
CREATE INDEX "CustomerAssignment_storeId_assigneeEmployeeId_status_idx" ON "CustomerAssignment"("storeId", "assigneeEmployeeId", "status");

-- CreateIndex
CREATE INDEX "CustomerAssignment_assignedById_idx" ON "CustomerAssignment"("assignedById");

-- CreateIndex
CREATE INDEX "CommissionLedger_storeId_employeeId_status_idx" ON "CommissionLedger"("storeId", "employeeId", "status");

-- CreateIndex
CREATE INDEX "CommissionLedger_storeId_calculatedAt_idx" ON "CommissionLedger"("storeId", "calculatedAt");

-- CreateIndex
CREATE INDEX "CommissionLedger_billingOrderId_idx" ON "CommissionLedger"("billingOrderId");

-- CreateIndex
CREATE INDEX "BlacklistEntry_storeId_status_severity_idx" ON "BlacklistEntry"("storeId", "status", "severity");

-- CreateIndex
CREATE INDEX "BlacklistEntry_storeId_phoneHash_idx" ON "BlacklistEntry"("storeId", "phoneHash");

-- CreateIndex
CREATE INDEX "BlacklistEntry_storeId_idCardHash_idx" ON "BlacklistEntry"("storeId", "idCardHash");

-- CreateIndex
CREATE INDEX "BlacklistEntry_memberId_idx" ON "BlacklistEntry"("memberId");

-- CreateIndex
CREATE INDEX "ReminderTask_storeId_assigneeEmployeeId_status_dueAt_idx" ON "ReminderTask"("storeId", "assigneeEmployeeId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "ReminderTask_memberId_idx" ON "ReminderTask"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderTask_storeId_idempotencyKey_key" ON "ReminderTask"("storeId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AuditLog_storeId_resourceType_resourceId_idx" ON "AuditLog"("storeId", "resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "AuditLog_storeId_actorEmployeeId_createdAt_idx" ON "AuditLog"("storeId", "actorEmployeeId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_requestId_idx" ON "AuditLog"("requestId");

-- CreateIndex
CREATE INDEX "ExportJob_storeId_module_status_createdAt_idx" ON "ExportJob"("storeId", "module", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ExportJob_requestedById_idx" ON "ExportJob"("requestedById");

-- CreateIndex
CREATE INDEX "ExportJob_downloadTokenHash_idx" ON "ExportJob"("downloadTokenHash");

-- CreateIndex
CREATE INDEX "_PermissionToRole_B_index" ON "_PermissionToRole"("B");

-- AddForeignKey
ALTER TABLE "StaffRole" ADD CONSTRAINT "StaffRole_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffRole" ADD CONSTRAINT "StaffRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_ownerEmployeeId_fkey" FOREIGN KEY ("ownerEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberProfile" ADD CONSTRAINT "MemberProfile_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberDocument" ADD CONSTRAINT "MemberDocument_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberDocument" ADD CONSTRAINT "MemberDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberDocument" ADD CONSTRAINT "MemberDocument_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchRecord" ADD CONSTRAINT "MatchRecord_initiatorMemberId_fkey" FOREIGN KEY ("initiatorMemberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchRecord" ADD CONSTRAINT "MatchRecord_candidateMemberId_fkey" FOREIGN KEY ("candidateMemberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchRecord" ADD CONSTRAINT "MatchRecord_ownerEmployeeId_fkey" FOREIGN KEY ("ownerEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpRecord" ADD CONSTRAINT "FollowUpRecord_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpRecord" ADD CONSTRAINT "FollowUpRecord_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "MatchRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpRecord" ADD CONSTRAINT "FollowUpRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityRegistration" ADD CONSTRAINT "ActivityRegistration_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityRegistration" ADD CONSTRAINT "ActivityRegistration_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInRecord" ADD CONSTRAINT "CheckInRecord_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "ActivityRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingOrder" ADD CONSTRAINT "BillingOrder_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingOrder" ADD CONSTRAINT "BillingOrder_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MembershipPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingOrder" ADD CONSTRAINT "BillingOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_billingOrderId_fkey" FOREIGN KEY ("billingOrderId") REFERENCES "BillingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAssignment" ADD CONSTRAINT "CustomerAssignment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAssignment" ADD CONSTRAINT "CustomerAssignment_assigneeEmployeeId_fkey" FOREIGN KEY ("assigneeEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAssignment" ADD CONSTRAINT "CustomerAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionLedger" ADD CONSTRAINT "CommissionLedger_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionLedger" ADD CONSTRAINT "CommissionLedger_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionLedger" ADD CONSTRAINT "CommissionLedger_billingOrderId_fkey" FOREIGN KEY ("billingOrderId") REFERENCES "BillingOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionLedger" ADD CONSTRAINT "CommissionLedger_calculatedById_fkey" FOREIGN KEY ("calculatedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlacklistEntry" ADD CONSTRAINT "BlacklistEntry_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlacklistEntry" ADD CONSTRAINT "BlacklistEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderTask" ADD CONSTRAINT "ReminderTask_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderTask" ADD CONSTRAINT "ReminderTask_assigneeEmployeeId_fkey" FOREIGN KEY ("assigneeEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderTask" ADD CONSTRAINT "ReminderTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorEmployeeId_fkey" FOREIGN KEY ("actorEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PermissionToRole" ADD CONSTRAINT "_PermissionToRole_A_fkey" FOREIGN KEY ("A") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PermissionToRole" ADD CONSTRAINT "_PermissionToRole_B_fkey" FOREIGN KEY ("B") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

