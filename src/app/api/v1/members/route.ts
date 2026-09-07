import { randomUUID } from "node:crypto";
import type { Member, Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiCode, apiResponse, apiSuccess } from "@/lib/server/api-response";
import { findActiveBlacklistBlock } from "@/lib/server/blacklist";
import { prisma } from "@/lib/server/prisma";
import { memberProfileView } from "@/lib/server/member-profile-view";
import {
  actorEmployeeId,
  canViewMemberIdentity,
  requireCurrentEmployee,
  requirePermission,
  writeAuditLog,
} from "@/lib/server/route-helpers";
import {
  decryptSensitivePlaceholder,
  encryptSensitiveValue,
  hashSensitiveValue,
  maskEmail,
  maskPhone,
  normalizePhone,
} from "@/lib/server/sensitive-fields";

const genders = ["MALE", "FEMALE", "OTHER", "UNKNOWN"] as const;
const educationLevels = ["初中及以下", "高中/中专", "大专", "本科", "硕士", "博士", "其他"] as const;
const maritalStatuses = ["未婚", "离异", "丧偶", "未知"] as const;
const incomeRanges = ["保密", "10万以下", "10-20万", "20-30万", "30-50万", "50-100万", "100万以上"] as const;
const mainlandChinaPhonePattern = /^1[3-9]\d{9}$/;
const memberNamePattern = /^[\p{L}\p{M}·.' ]+$/u;
const visibleTextPattern = /^[^\p{C}]+$/u;

function isEligibleBirthDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) {
    return false;
  }

  const datePart = value.slice(0, 10);
  const birthDate = new Date(`${datePart}T00:00:00.000Z`);

  if (
    Number.isNaN(birthDate.getTime()) ||
    birthDate.toISOString().slice(0, 10) !== datePart
  ) {
    return false;
  }

  const today = new Date();
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const birthdayThisYear = new Date(Date.UTC(
    today.getUTCFullYear(),
    birthDate.getUTCMonth(),
    birthDate.getUTCDate(),
  ));

  if (today < birthdayThisYear) {
    age -= 1;
  }

  return age >= 18 && age <= 80;
}

const createMemberSchema = z.object({
  storeId: z.string().trim().min(1).max(80).optional(),
  ownerEmployeeId: z.string().trim().min(1).max(80).optional(),
  name: z.string().trim().min(2).max(30).regex(memberNamePattern),
  phone: z.string().trim().regex(mainlandChinaPhonePattern).optional(),
  email: z.string().trim().email().max(160).optional(),
  gender: z.enum(genders).default("UNKNOWN"),
  birthDate: z.string().trim().refine(isEligibleBirthDate, "出生日期格式错误").optional(),
  source: z.string().trim().min(2).max(40).regex(visibleTextPattern).optional(),
  education: z.enum(educationLevels).optional(),
  heightCm: z.coerce.number().int().min(120).max(230).optional(),
  weightKg: z.coerce.number().int().min(30).max(200).optional(),
  maritalStatus: z.enum(maritalStatuses).optional(),
  occupation: z.string().trim().max(40).regex(visibleTextPattern).optional(),
  incomeRange: z.enum(incomeRanges).optional(),
  hometown: z.string().trim().max(40).regex(visibleTextPattern).optional(),
  currentCity: z.string().trim().max(40).regex(visibleTextPattern).optional(),
  housingStatus: z.string().trim().max(40).regex(visibleTextPattern).optional(),
  vehicleStatus: z.string().trim().max(40).regex(visibleTextPattern).optional(),
  familyBackground: z.string().trim().max(500).regex(visibleTextPattern).optional(),
  selfDescription: z.string().trim().max(500).regex(visibleTextPattern).optional(),
  matePreference: z.string().trim().max(500).regex(visibleTextPattern).optional(),
});

type MemberListItem = {
  id: string;
  memberNo: string;
  name: string;
  phoneMasked: string | null;
  phone: string | null;
  idCardMasked: string | null;
  idCard: string | null;
  canEditIdentity: boolean;
  emailMasked: string | null;
  gender: Member["gender"];
  birthDate: string | null;
  status: Member["status"];
  storeId: string;
  ownerEmployeeId: string;
  ownerName: string | null;
  source: string | null;
  profileCompletenessPercent: number;
  education: string | null;
  heightCm: number | null;
  weightKg: number | null;
  maritalStatus: string | null;
  occupation: string | null;
  incomeRange: string | null;
  hometown: string | null;
  currentCity: string | null;
  housingStatus: string | null;
  vehicleStatus: string | null;
  familyBackground: string | null;
  createdAt: string;
  updatedAt: string;
};

type MemberWithProfile = Member & {
  owner: Pick<Prisma.EmployeeGetPayload<{ select: { name: true } }>, "name"> | null;
};

function memberToListItem(
  member: MemberWithProfile,
  canViewIdentity: boolean,
  emailMasked: string | null = null,
): MemberListItem {
  const decryptedPhone = decryptSensitivePlaceholder(member.phoneEncrypted);
  const decryptedIdCard = decryptSensitivePlaceholder(member.idCardEncrypted);
  const profile = memberProfileView(member);

  return {
    id: member.id,
    memberNo: member.memberNo,
    name: member.name,
    phoneMasked: maskPhone(decryptedPhone),
    phone: canViewIdentity ? decryptedPhone : null,
    idCardMasked: decryptedIdCard ? `${decryptedIdCard.slice(0, 6)}********${decryptedIdCard.slice(-4)}` : null,
    idCard: canViewIdentity ? decryptedIdCard : null,
    canEditIdentity: canViewIdentity,
    emailMasked,
    gender: member.gender,
    birthDate: member.birthDate,
    status: member.status,
    storeId: member.storeId,
    ownerEmployeeId: member.ownerEmployeeId,
    ownerName: member.owner?.name ?? null,
    source: member.source,
    profileCompletenessPercent: profile.profileCompletenessPercent ?? 0,
    education: profile.education,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    maritalStatus: profile.maritalStatus,
    occupation: profile.occupation,
    incomeRange: profile.incomeRange,
    hometown: profile.hometown,
    currentCity: profile.currentCity,
    housingStatus: profile.housingStatus,
    vehicleStatus: profile.vehicleStatus,
    familyBackground: profile.familyBackground,
    createdAt: member.createdAt.toISOString(),
    updatedAt: member.updatedAt.toISOString(),
  };
}

function createMemberNo(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = String(parseInt(randomUUID().replace(/-/g, "").slice(0, 8), 16) % 1000000).padStart(6, "0");

  return `M${date}${suffix}`;
}

function profileCompleteness(input: z.infer<typeof createMemberSchema>): number {
  const fields = [
    input.name,
    input.phone,
    input.gender !== "UNKNOWN" ? input.gender : undefined,
    input.birthDate,
    input.education,
    input.heightCm,
    input.maritalStatus,
    input.occupation,
    input.incomeRange,
    input.hometown,
    input.currentCity,
    input.matePreference,
  ];
  const completed = fields.filter((field) => field !== undefined && field !== "").length;

  return Math.round((completed / fields.length) * 100);
}

function validationError(request: Request) {
  return apiResponse(request, {
    code: ApiCode.BAD_REQUEST,
    message: "参数错误",
    data: null,
    status: 400,
  });
}

const listMembersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  keyword: z.string().trim().max(100).optional(),
  name: z.string().trim().max(100).optional(),
  memberNo: z.string().trim().max(100).optional(),
  storeId: z.string().trim().max(100).optional(),
  ownerId: z.string().trim().max(100).optional(),
  status: z.enum(["LEAD", "ACTIVE", "MATCHING", "PAUSED", "MARRIED", "REFUNDED", "BLACKLISTED", "ARCHIVED"]).optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "memberNo"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export async function GET(request: Request) {
  const auth = await requireCurrentEmployee(request);
  if (auth instanceof Response) return auth;
  const forbidden = requirePermission(request, auth, "member:read");
  if (forbidden) return forbidden;
  const url = new URL(request.url);
  const parsed = listMembersSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return validationError(request);

  const query = parsed.data;
  const storeId = query.storeId ?? auth.employeeStoreId ?? undefined;
  const where: Prisma.MemberWhereInput = {
    ...(storeId ? { storeId } : {}),
    ...(query.ownerId ? { ownerEmployeeId: query.ownerId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.name ? { name: { contains: query.name, mode: "insensitive" } } : {}),
    ...(query.memberNo ? { memberNo: { contains: query.memberNo, mode: "insensitive" } } : {}),
    ...(query.keyword
      ? { OR: [
          { name: { contains: query.keyword, mode: "insensitive" } },
          { memberNo: { contains: query.keyword, mode: "insensitive" } },
          { occupation: { contains: query.keyword, mode: "insensitive" } },
        ] }
      : {}),
  };
  const [members, total] = await Promise.all([
    prisma.member.findMany({
      where,
      include: { owner: { select: { name: true } }, sensitiveInfo: { select: { phoneEncrypted: true } } },
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.member.count({ where }),
  ]);
  const items = members.map((member) => ({
    id: member.id,
    memberNo: member.memberNo,
    name: member.name,
    phoneMasked: maskPhone(decryptSensitivePlaceholder(member.sensitiveInfo?.phoneEncrypted ?? null)),
    phone: null,
    idCardMasked: null,
    idCard: null,
    canEditIdentity: false,
    emailMasked: null,
    gender: member.gender,
    birthDate: member.birthDate,
    status: member.status,
    storeId: member.storeId,
    ownerEmployeeId: member.ownerEmployeeId,
    ownerName: member.owner.name,
    source: null,
    profileCompletenessPercent: member.profileCompletenessPercent,
    education: member.education,
    heightCm: member.heightCm,
    weightKg: member.weightKg,
    maritalStatus: member.maritalStatus,
    occupation: member.occupation,
    incomeRange: member.incomeRange,
    hometown: [member.hometownProvince, member.hometownCity, member.hometownDistrict].filter(Boolean).join("-") || null,
    currentCity: [member.currentProvince, member.currentCity, member.currentDistrict].filter(Boolean).join("-") || null,
    hometownProvince: member.hometownProvince,
    hometownCity: member.hometownCity,
    hometownDistrict: member.hometownDistrict,
    currentProvince: member.currentProvince,
    currentCityCode: member.currentCity,
    currentDistrict: member.currentDistrict,
    housingStatus: member.housingStatus,
    vehicleStatus: member.vehicleStatus,
    familyBackground: null,
    createdAt: member.createdAt.toISOString(),
    updatedAt: member.updatedAt.toISOString(),
  }));
  return apiSuccess(request, { items, page: query.page, pageSize: query.pageSize, total, hasNext: query.page * query.pageSize < total });
}

export async function POST(request: Request) {
  const auth = await requireCurrentEmployee(request);

  if (auth instanceof Response) {
    return auth;
  }

  const forbidden = requirePermission(request, auth, "member:write");

  if (forbidden) {
    return forbidden;
  }

  const body = await request.json().catch(() => null);
  const parsed = createMemberSchema.safeParse(body);

  if (!parsed.success) {
    return validationError(request);
  }

  const storeId = parsed.data.storeId ?? auth.employee.storeId ?? process.env.DEMO_STORE_ID ?? "demo-store-shanghai";
  const ownerEmployeeId = parsed.data.ownerEmployeeId ?? auth.employee.employeeId;

  if (ownerEmployeeId === "bootstrap-admin") {
    return apiResponse(request, {
      code: ApiCode.BAD_REQUEST,
      message: "开发兜底账号创建会员时必须指定有效 ownerEmployeeId",
      data: null,
      status: 400,
    });
  }

  const owner = await prisma.employee.findFirst({
    where: {
      id: ownerEmployeeId,
      storeId,
      status: "ACTIVE",
    },
    select: { id: true },
  });

  if (!owner) {
    return apiResponse(request, {
      code: ApiCode.BAD_REQUEST,
      message: "归属员工不存在或不属于当前门店",
      data: null,
      status: 400,
    });
  }

  const phoneNormalized = parsed.data.phone ? normalizePhone(parsed.data.phone) : null;
  const memberNo = createMemberNo();

  const blacklistBlock = await findActiveBlacklistBlock(prisma, {
    storeId,
    phone: phoneNormalized,
  });

  if (blacklistBlock) {
    await writeAuditLog(prisma, request, auth, {
      storeId,
      action: "BLACKLIST_BLOCK",
      resourceType: "Member",
      metadata: {
        entryId: blacklistBlock.id,
        reason: blacklistBlock.reason,
        severity: blacklistBlock.severity,
        operation: "member.create",
      },
    });

    return apiResponse(request, {
      code: ApiCode.BLACKLIST_BLOCKED,
      message: "黑名单拦截",
      data: {
        blacklistEntryId: blacklistBlock.id,
        severity: blacklistBlock.severity,
      },
      status: 409,
    });
  }

  const created = await prisma.$transaction(async (tx) => {
    const member = await tx.member.create({
      data: {
        storeId,
        ownerEmployeeId,
        memberNo,
        name: parsed.data.name,
        gender: parsed.data.gender,
        birthDate: parsed.data.birthDate ?? null,
        phoneEncrypted: phoneNormalized ? encryptSensitiveValue(phoneNormalized) : null,
        phoneHash: phoneNormalized ? hashSensitiveValue(phoneNormalized) : null,
        status: "LEAD",
        source: parsed.data.source,
        heightCm: parsed.data.heightCm,
        weightKg: parsed.data.weightKg,
        education: parsed.data.education,
        maritalStatus: parsed.data.maritalStatus,
        occupation: parsed.data.occupation ?? null,
        incomeRange: parsed.data.incomeRange ?? null,
        hometown: parsed.data.hometown ?? null,
        currentCity: parsed.data.currentCity ?? null,
        housingStatus: parsed.data.housingStatus ?? null,
        vehicleStatus: parsed.data.vehicleStatus ?? null,
        familyBackground: parsed.data.familyBackground ?? null,
        selfDescription: parsed.data.selfDescription ?? null,
        matePreference: parsed.data.matePreference ?? null,
        profileCompletenessPercent: profileCompleteness(parsed.data),
        createdById: actorEmployeeId(auth),
      },
      include: {
        owner: {
          select: { name: true },
        },
      },
    });

    await writeAuditLog(tx, request, auth, {
      storeId,
      action: "CREATE",
      resourceType: "Member",
      resourceId: member.id,
      metadata: {
        memberNo: member.memberNo,
        ownerEmployeeId,
        status: member.status,
        source: member.source,
        hasPhone: Boolean(phoneNormalized),
        hasEmail: Boolean(parsed.data.email),
      },
    });

    return member;
  });

  return apiResponse(request, {
    code: ApiCode.OK,
    message: "创建成功",
    data: memberToListItem(created, canViewMemberIdentity(auth, created), maskEmail(parsed.data.email)),
    status: 201,
  });
}
