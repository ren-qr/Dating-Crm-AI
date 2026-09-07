import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

function loadEnvFile(fileUrl) {
  if (!existsSync(fileUrl)) {
    return;
  }

  const lines = readFileSync(fileUrl, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^(['"])(.*)\1$/, "$2");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(new URL("../.env", import.meta.url));

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is required. Copy .env.example to .env and point it at a PostgreSQL database before running pnpm seed.",
  );
  process.exit(1);
}

const prisma = new PrismaClient();

const storeId = process.env.DEMO_STORE_ID ?? "demo-store-shanghai";
const demoPassword = process.env.DEMO_SEED_PASSWORD ?? "Demo@123456";
const now = new Date("2026-07-11T09:00:00+08:00");

const permissionDefinitions = [
  ["member:read", "会员查看"],
  ["member:write", "会员编辑"],
  ["member:delete", "会员删除"],
  ["profile:read", "画像查看"],
  ["profile:write", "画像编辑"],
  ["document:read", "资料查看"],
  ["document:write", "资料编辑"],
  ["document:delete", "资料删除"],
  ["match:read", "匹配查看"],
  ["match:write", "匹配编辑"],
  ["match:execute", "执行匹配"],
  ["followup:read", "跟进查看"],
  ["followup:write", "跟进编辑"],
  ["activity:read", "活动查看"],
  ["activity:write", "活动编辑"],
  ["activity:checkin", "活动签到"],
  ["billing:read", "收费查看"],
  ["billing:write", "收费编辑"],
  ["finance:read", "财务查看"],
  ["finance:write", "财务编辑"],
  ["staff:read", "员工查看"],
  ["staff:write", "员工编辑"],
  ["role:read", "角色查看"],
  ["role:write", "角色编辑"],
  ["customer:read", "客户归属查看"],
  ["customer:assign", "客户归属调整"],
  ["customer:commission", "提成核算"],
  ["blacklist:read", "黑名单查看"],
  ["blacklist:write", "黑名单编辑"],
  ["reminder:read", "提醒查看"],
  ["reminder:write", "提醒编辑"],
  ["audit:read", "审计查看"],
  ["export:read", "导出查看"],
  ["export:write", "导出创建"],
];

const roleDefinitions = [
  {
    code: "admin",
    name: "管理员",
    description: "历史管理员角色代码，映射为 V3 管理员",
    permissions: permissionDefinitions.map(([code]) => code),
  },
  {
    code: "store_manager",
    name: "管理员",
    description: "历史门店管理角色代码，映射为 V3 管理员",
    permissions: [
      "member:read",
      "member:write",
      "member:delete",
      "profile:read",
      "profile:write",
      "document:read",
      "document:write",
      "match:read",
      "match:write",
      "match:execute",
      "followup:read",
      "followup:write",
      "activity:read",
      "activity:write",
      "activity:checkin",
      "billing:read",
      "billing:write",
      "finance:read",
      "staff:read",
      "customer:read",
      "customer:assign",
      "customer:commission",
      "blacklist:read",
      "blacklist:write",
      "reminder:read",
      "reminder:write",
      "audit:read",
      "export:read",
      "export:write",
    ],
  },
  {
    code: "consultant",
    name: "员工",
    description: "历史顾问角色代码，映射为 V3 员工",
    permissions: [
      "member:read",
      "member:write",
      "member:delete",
      "profile:read",
      "profile:write",
      "document:read",
      "document:write",
      "match:read",
      "match:write",
      "match:execute",
      "followup:read",
      "followup:write",
      "activity:read",
      "activity:checkin",
      "billing:read",
      "customer:read",
      "reminder:read",
      "reminder:write",
      "blacklist:read",
    ],
  },
];

const employeeDefinitions = [
  {
    email: "admin@meetra.local",
    name: "演示管理员",
    roleCode: "admin",
  },
  {
    email: "manager@meetra.local",
    name: "上海人民广场店长",
    roleCode: "store_manager",
  },
  {
    email: "consultant@meetra.local",
    name: "资深红娘顾问",
    roleCode: "consultant",
  },
];

function encrypted(label) {
  return `demo-encrypted:${label}`;
}

function digest(label) {
  return crypto.createHash("sha256").update(`demo:${label}`).digest("hex");
}

function daysFromNow(days) {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  return date;
}

async function seedPermissions() {
  await prisma.permission.createMany({
    data: permissionDefinitions.map(([code, name]) => ({ code, name })),
    skipDuplicates: true,
  });

  for (const [code, name] of permissionDefinitions) {
    await prisma.permission.update({
      where: { code },
      data: { name },
    });
  }
}

async function seedStore() {
  await prisma.store.upsert({
    where: { id: storeId },
    update: {
      name: "上海人民广场演示店",
      address: "上海市黄浦区人民广场",
      phone: "021-00000000",
      status: "ACTIVE",
    },
    create: {
      id: storeId,
      name: "上海人民广场演示店",
      address: "上海市黄浦区人民广场",
      phone: "021-00000000",
      status: "ACTIVE",
    },
  });
}

async function seedRoles() {
  const roles = {};

  for (const role of roleDefinitions) {
    roles[role.code] = await prisma.role.upsert({
      where: { storeId_code: { storeId, code: role.code } },
      update: {
        name: role.name,
        description: role.description,
        permissions: {
          set: role.permissions.map((code) => ({ code })),
        },
      },
      create: {
        storeId,
        code: role.code,
        name: role.name,
        description: role.description,
        permissions: {
          connect: role.permissions.map((code) => ({ code })),
        },
      },
    });
  }

  return roles;
}

async function seedEmployees(roles) {
  const passwordHash = await hash(demoPassword, 12);
  const employees = {};
  const legacyEmails = {
    "admin@meetra.local": "admin@demo.datemanage.local",
    "manager@meetra.local": "manager@demo.datemanage.local",
    "consultant@meetra.local": "consultant@demo.datemanage.local",
  };

  for (const employee of employeeDefinitions) {
    const legacyEmail = legacyEmails[employee.email];
    if (legacyEmail) {
      const currentEmailExists = await prisma.employee.findUnique({
        where: { storeId_email: { storeId, email: employee.email } },
        select: { id: true },
      });
      if (!currentEmailExists) {
        await prisma.employee.updateMany({
          where: { storeId, email: legacyEmail },
          data: { email: employee.email },
        });
      } else {
        await prisma.employee.updateMany({
          where: { storeId, email: legacyEmail },
          data: { email: `${employee.roleCode}-legacy@meetra.local`, status: "DISABLED" },
        });
      }
    }

    const savedEmployee = await prisma.employee.upsert({
      where: { storeId_email: { storeId, email: employee.email } },
      update: {
        name: employee.name,
        passwordHash,
        status: "ACTIVE",
        phoneEncrypted: encrypted(`${employee.roleCode}:phone`),
      },
      create: {
        storeId,
        email: employee.email,
        name: employee.name,
        passwordHash,
        status: "ACTIVE",
        phoneEncrypted: encrypted(`${employee.roleCode}:phone`),
      },
    });

    employees[employee.roleCode] = savedEmployee;

    await prisma.staffRole.upsert({
      where: {
        employeeId_roleId: {
          employeeId: savedEmployee.id,
          roleId: roles[employee.roleCode].id,
        },
      },
      update: {
        storeId,
      },
      create: {
        employeeId: savedEmployee.id,
        roleId: roles[employee.roleCode].id,
        storeId,
      },
    });
  }

  return employees;
}

async function seedMembers(employees) {
  const memberDefinitions = [
    {
      memberNo: "DM20260711001",
      name: "林晓雨",
      gender: "FEMALE",
      status: "MATCHING",
      source: "小红书咨询",
      owner: employees.consultant,
      phone: "13800000001",
      idCard: "demo-id-001",
      profile: {
        heightCm: 164,
        weightKg: 52,
        education: "本科",
        maritalStatus: "未婚",
        completeness: 92,
        occupation: "互联网产品经理",
        income: "20-30万",
        preference: "希望对方稳定真诚，接受同城发展",
      },
    },
    {
      memberNo: "DM20260711002",
      name: "陈明远",
      gender: "MALE",
      status: "ACTIVE",
      source: "老会员转介绍",
      owner: employees.store_manager,
      phone: "13800000002",
      idCard: "demo-id-002",
      profile: {
        heightCm: 178,
        weightKg: 72,
        education: "硕士",
        maritalStatus: "未婚",
        completeness: 88,
        occupation: "金融风控经理",
        income: "30-50万",
        preference: "重视沟通，期待稳定关系",
      },
    },
    {
      memberNo: "DM20260711003",
      name: "周晴",
      gender: "FEMALE",
      status: "ACTIVE",
      source: "门店到访",
      owner: employees.consultant,
      phone: "13800000003",
      idCard: "demo-id-003",
      profile: {
        heightCm: 166,
        weightKg: 55,
        education: "本科",
        maritalStatus: "离异",
        completeness: 76,
        occupation: "小学教师",
        income: "10-20万",
        preference: "希望对方有责任心，接受孩子",
      },
    },
    {
      memberNo: "DM20260711004",
      name: "风险样例会员",
      gender: "MALE",
      status: "BLACKLISTED",
      source: "黑名单拦截演示",
      owner: employees.store_manager,
      phone: "13800000004",
      idCard: "demo-id-004",
      blacklistedAt: daysFromNow(-1),
      profile: {
        heightCm: 180,
        weightKg: 80,
        education: "大专",
        maritalStatus: "未知",
        completeness: 40,
        occupation: "待核验",
        income: "待核验",
        preference: "风控拦截样例",
      },
    },
  ];

  const members = {};

  for (const member of memberDefinitions) {
    const savedMember = await prisma.member.upsert({
      where: { storeId_memberNo: { storeId, memberNo: member.memberNo } },
      update: {
        ownerEmployeeId: member.owner.id,
        name: member.name,
        gender: member.gender,
        phoneEncrypted: encrypted(`${member.memberNo}:phone`),
        phoneHash: digest(member.phone),
        idCardEncrypted: encrypted(`${member.memberNo}:id-card`),
        idCardHash: digest(member.idCard),
        status: member.status,
        source: member.source,
        blacklistedAt: member.blacklistedAt ?? null,
        heightCm: member.profile.heightCm,
        weightKg: member.profile.weightKg,
        education: member.profile.education,
        occupation: member.profile.occupation,
        incomeRange: member.profile.income,
        maritalStatus: member.profile.maritalStatus,
        housingStatus: `${member.memberNo}:housing`,
        vehicleStatus: `${member.memberNo}:vehicle`,
        hometown: `${member.memberNo}:hometown`,
        currentCity: "上海",
        familyBackground: `${member.memberNo}:family`,
        selfDescription: `${member.memberNo}:self`,
        matePreference: member.profile.preference,
        profileCompletenessPercent: member.profile.completeness,
        updatedById: employees.store_manager.id,
      },
      create: {
        storeId,
        ownerEmployeeId: member.owner.id,
        memberNo: member.memberNo,
        name: member.name,
        gender: member.gender,
        birthDate: null,
        phoneEncrypted: encrypted(`${member.memberNo}:phone`),
        phoneHash: digest(member.phone),
        idCardEncrypted: encrypted(`${member.memberNo}:id-card`),
        idCardHash: digest(member.idCard),
        status: member.status,
        source: member.source,
        blacklistedAt: member.blacklistedAt ?? null,
        heightCm: member.profile.heightCm,
        weightKg: member.profile.weightKg,
        education: member.profile.education,
        occupation: member.profile.occupation,
        incomeRange: member.profile.income,
        maritalStatus: member.profile.maritalStatus,
        housingStatus: `${member.memberNo}:housing`,
        vehicleStatus: `${member.memberNo}:vehicle`,
        hometown: `${member.memberNo}:hometown`,
        currentCity: "上海",
        familyBackground: `${member.memberNo}:family`,
        selfDescription: `${member.memberNo}:self`,
        matePreference: member.profile.preference,
        profileCompletenessPercent: member.profile.completeness,
        createdById: employees.store_manager.id,
        updatedById: employees.store_manager.id,
      },
    });

    members[member.memberNo] = savedMember;

  }

  return members;
}

async function seedOperationalData(employees, members) {
  // Legacy operational fixtures were removed with the consolidated tables.
  // New service and finance fixtures will be added against MemberService/Finance.
  return;

  const [primaryMember, candidateMember, returnVisitMember, blockedMember] = [
    members.DM20260711001,
    members.DM20260711002,
    members.DM20260711003,
    members.DM20260711004,
  ];

  await prisma.memberDocument.upsert({
    where: { id: "demo-doc-id-card-001" },
    update: {
      status: "VERIFIED",
      verifiedById: employees.store_manager.id,
      verifiedAt: daysFromNow(-2),
    },
    create: {
      id: "demo-doc-id-card-001",
      storeId,
      memberId: primaryMember.id,
      documentType: "ID_CARD",
      storageKeyEncrypted: encrypted("documents/id-card-001"),
      fileNameEncrypted: encrypted("id-card-001.png"),
      mimeType: "image/png",
      fileSizeBytes: 245760,
      checksumHash: digest("documents/id-card-001.png"),
      status: "VERIFIED",
      uploadedById: employees.consultant.id,
      verifiedById: employees.store_manager.id,
      verifiedAt: daysFromNow(-2),
    },
  });

  const match = await prisma.matchRecord.upsert({
    where: { id: "demo-match-success-001" },
    update: {
      status: "DATING",
      score: 86,
      reasonSummary: "学历、城市与婚恋节奏匹配度高",
      manualNote: "店长复核通过，建议安排周末咖啡约见",
    },
    create: {
      id: "demo-match-success-001",
      storeId,
      initiatorMemberId: primaryMember.id,
      candidateMemberId: candidateMember.id,
      ownerEmployeeId: employees.consultant.id,
      status: "DATING",
      score: 86,
      reasonSummary: "学历、城市与婚恋节奏匹配度高",
      manualNote: "店长复核通过，建议安排周末咖啡约见",
      matchedAt: daysFromNow(-3),
    },
  });

  await prisma.matchRecord.upsert({
    where: { id: "demo-match-blocked-001" },
    update: {
      status: "BLOCKED",
      blockedByBlacklist: true,
      manualNote: "黑名单命中，禁止牵线",
    },
    create: {
      id: "demo-match-blocked-001",
      storeId,
      initiatorMemberId: blockedMember.id,
      candidateMemberId: returnVisitMember.id,
      ownerEmployeeId: employees.store_manager.id,
      status: "BLOCKED",
      score: 0,
      reasonSummary: "黑名单命中",
      manualNote: "黑名单命中，禁止牵线",
      blockedByBlacklist: true,
      matchedAt: daysFromNow(-1),
    },
  });

  await prisma.followUpRecord.upsert({
    where: { id: "demo-followup-date-feedback-001" },
    update: {
      content: "双方反馈沟通顺畅，约定下周二继续见面。",
      nextAction: "顾问回访二次约见意愿",
      nextAt: daysFromNow(2),
    },
    create: {
      id: "demo-followup-date-feedback-001",
      storeId,
      memberId: primaryMember.id,
      matchId: match.id,
      employeeId: employees.consultant.id,
      type: "DATE_FEEDBACK",
      content: "双方反馈沟通顺畅，约定下周二继续见面。",
      nextAction: "顾问回访二次约见意愿",
      nextAt: daysFromNow(2),
    },
  });

  await prisma.followUpRecord.upsert({
    where: { id: "demo-followup-return-visit-001" },
    update: {
      content: "老会员回访，当前希望降低活动频次，保留精准推荐。",
      nextAction: "下月初再次回访",
      nextAt: daysFromNow(20),
    },
    create: {
      id: "demo-followup-return-visit-001",
      storeId,
      memberId: returnVisitMember.id,
      employeeId: employees.store_manager.id,
      type: "RETURN_VISIT",
      content: "老会员回访，当前希望降低活动频次，保留精准推荐。",
      nextAction: "下月初再次回访",
      nextAt: daysFromNow(20),
    },
  });

  const activity = await prisma.activity.upsert({
    where: { id: "demo-activity-weekend-salon" },
    update: {
      status: "PUBLISHED",
      startsAt: daysFromNow(6),
      endsAt: daysFromNow(6),
      capacity: 24,
    },
    create: {
      id: "demo-activity-weekend-salon",
      storeId,
      title: "周末高学历小型交友沙龙",
      description: "演示活动，覆盖报名、签到与黑名单拦截语义。",
      status: "PUBLISHED",
      startsAt: daysFromNow(6),
      endsAt: daysFromNow(6),
      location: "上海人民广场店 3F 活动室",
      capacity: 24,
      feeAmountCents: 9900,
      createdById: employees.store_manager.id,
    },
  });

  const registration = await prisma.activityRegistration.upsert({
    where: {
      activityId_memberId: {
        activityId: activity.id,
        memberId: primaryMember.id,
      },
    },
    update: {
      status: "CHECKED_IN",
      blockedByBlacklist: false,
    },
    create: {
      storeId,
      activityId: activity.id,
      memberId: primaryMember.id,
      status: "CHECKED_IN",
      blockedByBlacklist: false,
      registeredAt: daysFromNow(-2),
    },
  });

  await prisma.checkInRecord.upsert({
    where: { id: "demo-checkin-001" },
    update: {
      status: "CHECKED_IN",
      note: "顾问现场核验签到",
    },
    create: {
      id: "demo-checkin-001",
      storeId,
      registrationId: registration.id,
      status: "CHECKED_IN",
      checkedInAt: daysFromNow(-1),
      note: "顾问现场核验签到",
    },
  });

  await prisma.activityRegistration.upsert({
    where: {
      activityId_memberId: {
        activityId: activity.id,
        memberId: blockedMember.id,
      },
    },
    update: {
      status: "BLOCKED",
      blockedByBlacklist: true,
    },
    create: {
      storeId,
      activityId: activity.id,
      memberId: blockedMember.id,
      status: "BLOCKED",
      blockedByBlacklist: true,
      registeredAt: daysFromNow(-1),
    },
  });

  const plan = await prisma.membershipPlan.upsert({
    where: { storeId_code: { storeId, code: "VIP_12M" } },
    update: {
      name: "VIP 年度服务",
      durationDays: 365,
      priceCents: 1999000,
      commissionRateBps: 800,
      status: "ACTIVE",
    },
    create: {
      storeId,
      code: "VIP_12M",
      name: "VIP 年度服务",
      description: "演示收费套餐，含精准匹配、活动优先报名与顾问回访。",
      durationDays: 365,
      priceCents: 1999000,
      commissionRateBps: 800,
      status: "ACTIVE",
    },
  });

  const order = await prisma.billingOrder.upsert({
    where: { storeId_orderNo: { storeId, orderNo: "DMO20260711001" } },
    update: {
      amountCents: 1999000,
      discountCents: 200000,
      payableAmountCents: 1799000,
      paidAmountCents: 1799000,
      status: "PAID",
      paidAt: daysFromNow(-5),
    },
    create: {
      storeId,
      orderNo: "DMO20260711001",
      memberId: primaryMember.id,
      planId: plan.id,
      amountCents: 1999000,
      discountCents: 200000,
      payableAmountCents: 1799000,
      paidAmountCents: 1799000,
      status: "PAID",
      createdById: employees.store_manager.id,
      dueAt: daysFromNow(3),
      paidAt: daysFromNow(-5),
    },
  });

  await prisma.paymentRecord.upsert({
    where: { id: "demo-payment-001" },
    update: {
      amountCents: 1799000,
      status: "SUCCESS",
      paidAt: daysFromNow(-5),
    },
    create: {
      id: "demo-payment-001",
      storeId,
      billingOrderId: order.id,
      amountCents: 1799000,
      method: "WECHAT_PAY",
      status: "SUCCESS",
      transactionNoHash: digest("demo-payment-001"),
      receivedById: employees.store_manager.id,
      paidAt: daysFromNow(-5),
    },
  });

  await prisma.commissionLedger.upsert({
    where: { id: "demo-commission-001" },
    update: {
      baseAmountCents: 1799000,
      commissionAmountCents: 143920,
      status: "CONFIRMED",
    },
    create: {
      id: "demo-commission-001",
      storeId,
      employeeId: employees.consultant.id,
      memberId: primaryMember.id,
      billingOrderId: order.id,
      baseAmountCents: 1799000,
      commissionAmountCents: 143920,
      status: "CONFIRMED",
      calculatedById: employees.store_manager.id,
      calculatedAt: daysFromNow(-4),
    },
  });

  await prisma.customerAssignment.upsert({
    where: { id: "demo-assignment-001" },
    update: {
      assigneeEmployeeId: employees.consultant.id,
      assignedById: employees.store_manager.id,
      status: "ACTIVE",
      reason: "演示客户归属：顾问负责后续匹配和回访",
    },
    create: {
      id: "demo-assignment-001",
      storeId,
      memberId: primaryMember.id,
      assigneeEmployeeId: employees.consultant.id,
      assignedById: employees.store_manager.id,
      status: "ACTIVE",
      reason: "演示客户归属：顾问负责后续匹配和回访",
      startsAt: daysFromNow(-7),
    },
  });

  await prisma.blacklistEntry.upsert({
    where: { id: "demo-blacklist-001" },
    update: {
      status: "ACTIVE",
      severity: "HIGH",
      reason: "资料核验异常，阻断匹配、活动报名、收费和归属调整。",
    },
    create: {
      id: "demo-blacklist-001",
      storeId,
      memberId: blockedMember.id,
      phoneHash: blockedMember.phoneHash,
      idCardHash: blockedMember.idCardHash,
      reason: "资料核验异常，阻断匹配、活动报名、收费和归属调整。",
      severity: "HIGH",
      status: "ACTIVE",
      createdById: employees.store_manager.id,
    },
  });

  await prisma.reminderTask.upsert({
    where: {
      storeId_idempotencyKey: {
        storeId,
        idempotencyKey: "demo-reminder-followup-001",
      },
    },
    update: {
      assigneeEmployeeId: employees.consultant.id,
      title: "二次约见意愿回访",
      dueAt: daysFromNow(2),
      status: "PENDING",
    },
    create: {
      storeId,
      memberId: primaryMember.id,
      assigneeEmployeeId: employees.consultant.id,
      createdById: employees.store_manager.id,
      title: "二次约见意愿回访",
      description: "根据最近一次相亲反馈，确认双方是否进入二次约见。",
      dueAt: daysFromNow(2),
      status: "PENDING",
      idempotencyKey: "demo-reminder-followup-001",
    },
  });

  await prisma.revenueSnapshot.upsert({
    where: {
      storeId_snapshotDate: {
        storeId,
        snapshotDate: new Date("2026-07-11T00:00:00+08:00"),
      },
    },
    update: {
      newMemberCount: 4,
      matchSuccessCount: 1,
      activityCheckInCount: 1,
      revenueCents: 1799000,
      commissionCents: 143920,
    },
    create: {
      storeId,
      snapshotDate: new Date("2026-07-11T00:00:00+08:00"),
      newMemberCount: 4,
      matchSuccessCount: 1,
      activityCheckInCount: 1,
      revenueCents: 1799000,
      commissionCents: 143920,
    },
  });

  await prisma.exportJob.upsert({
    where: { id: "demo-export-members-001" },
    update: {
      module: "MEMBERS",
      status: "SUCCEEDED",
      dateFrom: daysFromNow(-30),
      dateTo: now,
    },
    create: {
      id: "demo-export-members-001",
      storeId,
      requestedById: employees.store_manager.id,
      module: "MEMBERS",
      status: "SUCCEEDED",
      filtersJson: {
        status: ["ACTIVE", "MATCHING"],
        storeId,
      },
      dateFrom: daysFromNow(-30),
      dateTo: now,
      fileKeyEncrypted: encrypted("exports/members-20260711.xlsx"),
      fileNameEncrypted: encrypted("members-20260711.xlsx"),
      downloadTokenHash: digest("demo-export-token"),
      expiresAt: daysFromNow(7),
    },
  });

  const auditEntries = [
    {
      id: "demo-audit-login-001",
      actorEmployeeId: employees.admin.id,
      action: "LOGIN",
      resourceType: "Employee",
      resourceId: employees.admin.id,
      metadataJson: { channel: "credentials", demo: true },
    },
    {
      id: "demo-audit-member-update-001",
      actorEmployeeId: employees.consultant.id,
      action: "UPDATE",
      resourceType: "Member",
      resourceId: primaryMember.id,
      metadataJson: { fields: ["profileCompletenessPercent"], demo: true },
    },
    {
      id: "demo-audit-blacklist-block-001",
      actorEmployeeId: employees.store_manager.id,
      action: "BLACKLIST_BLOCK",
      resourceType: "BlacklistEntry",
      resourceId: "demo-blacklist-001",
      metadataJson: {
        blockedModules: ["match", "activity", "billing", "assignment"],
        demo: true,
      },
    },
    {
      id: "demo-audit-export-001",
      actorEmployeeId: employees.store_manager.id,
      action: "EXPORT",
      resourceType: "ExportJob",
      resourceId: "demo-export-members-001",
      metadataJson: { module: "MEMBERS", desensitized: true, demo: true },
    },
  ];

  for (const auditEntry of auditEntries) {
    await prisma.auditLog.upsert({
      where: { id: auditEntry.id },
      update: {
        actorEmployeeId: auditEntry.actorEmployeeId,
        action: auditEntry.action,
        resourceType: auditEntry.resourceType,
        resourceId: auditEntry.resourceId,
        metadataJson: auditEntry.metadataJson,
      },
      create: {
        id: auditEntry.id,
        storeId,
        actorEmployeeId: auditEntry.actorEmployeeId,
        action: auditEntry.action,
        resourceType: auditEntry.resourceType,
        resourceId: auditEntry.resourceId,
        requestId: auditEntry.id,
        beforeHash: digest(`${auditEntry.id}:before`),
        afterHash: digest(`${auditEntry.id}:after`),
        metadataJson: auditEntry.metadataJson,
        ipHash: digest("127.0.0.1"),
        userAgentHash: digest("demo-seed"),
      },
    });
  }
}

async function main() {
  await seedPermissions();
  await seedStore();
  const roles = await seedRoles();
  const employees = await seedEmployees(roles);
  const members = await seedMembers(employees);
  await seedOperationalData(employees, members);

  console.log(`Seeded demo store: ${storeId}`);
  console.log("Demo accounts:");
  for (const employee of employeeDefinitions) {
    console.log(`- ${employee.email} / ${demoPassword}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
