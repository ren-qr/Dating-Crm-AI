import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiCode, apiResponse, apiSuccess } from "@/lib/server/api-response";
import { findActiveBlacklistBlock } from "@/lib/server/blacklist";
import { memberToReadDto } from "@/lib/server/member-view";
import { prisma } from "@/lib/server/prisma";
import {
  actorEmployeeId,
  canViewMemberIdentity,
  requireCurrentEmployee,
  requirePermission,
  resolveStoreScope,
  writeAuditLog,
} from "@/lib/server/route-helpers";
import { encryptSensitiveValue, hashSensitiveValue, normalizePhone } from "@/lib/server/sensitive-fields";

const genders = ["MALE", "FEMALE", "OTHER", "UNKNOWN"] as const;
const memberStatuses = ["LEAD", "ACTIVE", "MATCHING", "PAUSED", "MARRIED", "REFUNDED", "BLACKLISTED", "ARCHIVED"] as const;
const phonePattern = /^1[3-9]\d{9}$/;
const nullableText = z.string().trim().max(500).nullable().optional();

function normalizeBirthDate(value: string) {
  const datePart = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  const date = new Date(`${datePart}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== datePart ? null : datePart;
}

const createMemberSchema = z.object({
  storeId: z.string().trim().min(1).max(80).optional(),
  ownerEmployeeId: z.string().trim().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().regex(phonePattern).optional(),
  gender: z.enum(genders).default("UNKNOWN"),
  birthDate: z.string().trim().optional(),
  status: z.enum(memberStatuses).default("LEAD"),
  heightCm: z.coerce.number().int().min(80).max(260).nullable().optional(),
  weightKg: z.coerce.number().int().min(20).max(300).nullable().optional(),
  education: nullableText,
  maritalStatus: nullableText,
  occupation: nullableText,
  incomeRange: nullableText,
  hometownProvince: z.string().trim().max(20).nullable().optional(),
  hometownCity: z.string().trim().max(20).nullable().optional(),
  hometownDistrict: z.string().trim().max(20).nullable().optional(),
  currentProvince: z.string().trim().max(20).nullable().optional(),
  currentCity: z.string().trim().max(20).nullable().optional(),
  currentDistrict: z.string().trim().max(20).nullable().optional(),
  housingStatus: nullableText,
  vehicleStatus: nullableText,
  hobbies: nullableText,
  selfDescription: nullableText,
});

const listMembersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  keyword: z.string().trim().max(100).optional(),
  name: z.string().trim().max(100).optional(),
  memberNo: z.string().trim().max(100).optional(),
  status: z.enum(memberStatuses).optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "memberNo"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

function createMemberNo() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = String(parseInt(randomUUID().replace(/-/g, "").slice(0, 8), 16) % 1_000_000).padStart(6, "0");
  return `M${date}${suffix}`;
}

function profileCompleteness(input: z.infer<typeof createMemberSchema>) {
  const fields = [input.name, input.phone, input.birthDate, input.education, input.heightCm, input.occupation, input.currentCity, input.selfDescription];
  return Math.round((fields.filter((field) => field !== undefined && field !== null && field !== "").length / fields.length) * 100);
}

function validationError(request: Request, message = "参数错误") {
  return apiResponse(request, { code: ApiCode.BAD_REQUEST, message, data: null, status: 400 });
}

export async function GET(request: Request) {
  const auth = await requireCurrentEmployee(request);
  if (auth instanceof Response) return auth;
  const forbidden = requirePermission(request, auth, "member:read");
  if (forbidden) return forbidden;
  const parsed = listMembersSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return validationError(request);
  const storeScope = await resolveStoreScope(request, auth);
  if (storeScope instanceof Response) return storeScope;
  const query = parsed.data;
  const where: Prisma.MemberWhereInput = {
    storeId: storeScope.storeId,
    ...(auth.isBootstrapAdmin ? {} : { ownerEmployeeId: auth.employee.employeeId }),
    ...(query.status ? { status: query.status } : {}),
    ...(query.name ? { name: { contains: query.name, mode: "insensitive" } } : {}),
    ...(query.memberNo ? { memberNo: { contains: query.memberNo, mode: "insensitive" } } : {}),
    ...(query.keyword ? { OR: [
      { name: { contains: query.keyword, mode: "insensitive" } },
      { memberNo: { contains: query.keyword, mode: "insensitive" } },
      { occupation: { contains: query.keyword, mode: "insensitive" } },
    ] } : {}),
  };
  const [members, total] = await Promise.all([
    prisma.member.findMany({
      where,
      include: { owner: { select: { name: true } }, sensitiveInfo: true, matePreference: true, extraProfile: true },
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.member.count({ where }),
  ]);
  return apiSuccess(request, {
    items: members.map((member) => memberToReadDto(member, canViewMemberIdentity(auth, member))),
    page: query.page,
    pageSize: query.pageSize,
    total,
    hasNext: query.page * query.pageSize < total,
  });
}

export async function POST(request: Request) {
  const auth = await requireCurrentEmployee(request);
  if (auth instanceof Response) return auth;
  const forbidden = requirePermission(request, auth, "member:write");
  if (forbidden) return forbidden;
  const parsed = createMemberSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(request);
  const birthDate = parsed.data.birthDate ? normalizeBirthDate(parsed.data.birthDate) : null;
  if (parsed.data.birthDate && !birthDate) return validationError(request, "参数错误：birthDate 无效");
  const storeScope = await resolveStoreScope(request, auth, parsed.data.storeId);
  if (storeScope instanceof Response) return storeScope;
  const ownerEmployeeId = parsed.data.ownerEmployeeId ?? actorEmployeeId(auth);
  if (!ownerEmployeeId) return validationError(request, "开发兜底账号必须指定归属员工");
  if (!auth.isBootstrapAdmin && ownerEmployeeId !== auth.employee.employeeId) {
    return apiResponse(request, { code: ApiCode.FORBIDDEN, message: "无权指定其他归属员工", data: null, status: 403 });
  }
  const owner = await prisma.employee.findFirst({ where: { id: ownerEmployeeId, storeId: storeScope.storeId, status: "ACTIVE" }, select: { id: true } });
  if (!owner) return validationError(request, "归属员工不存在或不属于当前门店");
  const phone = parsed.data.phone ? normalizePhone(parsed.data.phone) : null;
  const blocked = await findActiveBlacklistBlock(prisma, { storeId: storeScope.storeId, phone });
  if (blocked) return apiResponse(request, { code: ApiCode.BLACKLIST_BLOCKED, message: "黑名单拦截", data: { blacklistEntryId: blocked.id, severity: blocked.severity }, status: 409 });

  const member = await prisma.$transaction(async (tx) => {
    const created = await tx.member.create({
      data: {
        storeId: storeScope.storeId,
        ownerEmployeeId,
        memberNo: createMemberNo(),
        name: parsed.data.name,
        gender: parsed.data.gender,
        birthDate,
        status: parsed.data.status,
        heightCm: parsed.data.heightCm ?? null,
        weightKg: parsed.data.weightKg ?? null,
        education: parsed.data.education ?? null,
        maritalStatus: parsed.data.maritalStatus ?? null,
        occupation: parsed.data.occupation ?? null,
        incomeRange: parsed.data.incomeRange ?? null,
        hometownProvince: parsed.data.hometownProvince ?? null,
        hometownCity: parsed.data.hometownCity ?? null,
        hometownDistrict: parsed.data.hometownDistrict ?? null,
        currentProvince: parsed.data.currentProvince ?? null,
        currentCity: parsed.data.currentCity ?? null,
        currentDistrict: parsed.data.currentDistrict ?? null,
        housingStatus: parsed.data.housingStatus ?? null,
        vehicleStatus: parsed.data.vehicleStatus ?? null,
        profileCompletenessPercent: profileCompleteness(parsed.data),
        createdById: actorEmployeeId(auth),
        ...(phone ? { sensitiveInfo: { create: { storeId: storeScope.storeId, phoneEncrypted: encryptSensitiveValue(phone), phoneHash: hashSensitiveValue(phone) } } } : {}),
        ...((parsed.data.hobbies !== undefined || parsed.data.selfDescription !== undefined)
          ? { extraProfile: { create: { storeId: storeScope.storeId, hobbies: parsed.data.hobbies ?? null, selfDescription: parsed.data.selfDescription ?? null } } }
          : {}),
      },
      include: { owner: { select: { name: true } }, sensitiveInfo: true, matePreference: true, extraProfile: true },
    });
    await writeAuditLog(tx, request, auth, { storeId: storeScope.storeId, action: "CREATE", resourceType: "Member", resourceId: created.id, metadata: { memberNo: created.memberNo, ownerEmployeeId, hasPhone: Boolean(phone) } });
    return created;
  });
  return apiResponse(request, { code: ApiCode.OK, message: "创建成功", data: memberToReadDto(member, canViewMemberIdentity(auth, member)), status: 201 });
}
