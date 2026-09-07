import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiCode, apiResponse, apiSuccess } from "@/lib/server/api-response";
import { memberToReadDto, type MemberWithReadRelations } from "@/lib/server/member-view";
import { prisma } from "@/lib/server/prisma";
import {
  actorEmployeeId,
  canViewMemberIdentity,
  requireCurrentEmployee,
  requireMemberContactEditScope,
  requireMemberEditScope,
  requirePermission,
  resolveStoreScope,
  writeAuditLog,
} from "@/lib/server/route-helpers";
import { encryptSensitiveValue, hashSensitiveValue, normalizePhone } from "@/lib/server/sensitive-fields";

const genders = ["MALE", "FEMALE", "OTHER", "UNKNOWN"] as const;
const memberStatuses = ["LEAD", "ACTIVE", "MATCHING", "PAUSED", "MARRIED", "REFUNDED", "BLACKLISTED", "ARCHIVED"] as const;
const preferenceGenders = ["OPPOSITE", "MALE", "FEMALE", "ANY", "OTHER"] as const;
const nullableText = z.string().trim().max(500).nullable().optional();

function normalizeBirthDate(value: string) {
  const datePart = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  const date = new Date(`${datePart}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== datePart ? null : datePart;
}

const updateMemberSchema = z.object({
  ownerEmployeeId: z.string().trim().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().regex(/^1[3-9]\d{9}$/).nullable().optional(),
  gender: z.enum(genders).optional(),
  birthDate: z.string().trim().nullable().optional(),
  status: z.enum(memberStatuses).optional(),
  heightCm: z.number().int().min(80).max(260).nullable().optional(),
  weightKg: z.number().int().min(20).max(300).nullable().optional(),
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
  ageMin: z.number().int().min(18).max(100).nullable().optional(),
  ageMax: z.number().int().min(18).max(100).nullable().optional(),
  genderPreference: z.enum(preferenceGenders).optional(),
  educationRequirement: nullableText,
  incomeMinAnnual: z.number().int().min(0).nullable().optional(),
  heightMinCm: z.number().int().min(80).max(260).nullable().optional(),
  heightMaxCm: z.number().int().min(80).max(260).nullable().optional(),
  maritalStatusRequirements: z.array(z.string().trim().max(40)).optional(),
  hasHousing: z.boolean().nullable().optional(),
  hasVehicle: z.boolean().nullable().optional(),
  smokingPreference: nullableText,
  drinkingPreference: nullableText,
});

type RouteContext = { params: Promise<{ id: string }> };
const readInclude = { owner: { select: { name: true } }, sensitiveInfo: true, matePreference: true, extraProfile: true } satisfies Prisma.MemberInclude;

function validationError(request: Request, message = "参数错误") {
  return apiResponse(request, { code: ApiCode.BAD_REQUEST, message, data: null, status: 400 });
}

async function memberScope(request: Request, auth: Exclude<Awaited<ReturnType<typeof requireCurrentEmployee>>, Response>, id: string) {
  const storeScope = await resolveStoreScope(request, auth);
  if (storeScope instanceof Response) return storeScope;
  return prisma.member.findFirst({
    where: { id, storeId: storeScope.storeId, ...(auth.isBootstrapAdmin ? {} : { ownerEmployeeId: auth.employee.employeeId }) },
    include: readInclude,
  });
}

async function detailDto(request: Request, auth: Exclude<Awaited<ReturnType<typeof requireCurrentEmployee>>, Response>, member: MemberWithReadRelations) {
  const [documents, followups, blacklistEntries, auditLogs] = await Promise.all([
    prisma.memberDocument.findMany({ where: { memberId: member.id, storeId: member.storeId }, select: { id: true, documentType: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
    prisma.followUpRecord.findMany({ where: { memberId: member.id, storeId: member.storeId }, select: { id: true, type: true, nextAction: true, nextAt: true, createdAt: true, employee: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.blacklistEntry.findMany({ where: { memberId: member.id, storeId: member.storeId }, select: { id: true, reason: true, severity: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
    prisma.auditLog.findMany({ where: { storeId: member.storeId, resourceType: "Member", resourceId: member.id }, include: { actorEmployee: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  return {
    ...memberToReadDto(member, canViewMemberIdentity(auth, member)),
    documents: documents.map((item) => ({ id: item.id, type: item.documentType, status: item.status, createdAt: item.createdAt.toISOString() })),
    followups: followups.map((item) => ({ id: item.id, method: item.type, content: null, nextAction: item.nextAction, nextFollowUpAt: item.nextAt?.toISOString() ?? null, actorName: item.employee?.name ?? null, createdAt: item.createdAt.toISOString() })),
    blacklistEntries: blacklistEntries.map((item) => ({ id: item.id, reason: item.reason, riskType: item.severity, status: item.status, createdAt: item.createdAt.toISOString() })),
    auditLogs: auditLogs.map((item) => ({ id: item.id, action: item.action, resourceType: item.resourceType, resourceId: item.resourceId, actorName: item.actorEmployee?.name ?? null, metadataJson: item.metadataJson, createdAt: item.createdAt.toISOString() })),
  };
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireCurrentEmployee(request);
  if (auth instanceof Response) return auth;
  const memberForbidden = requirePermission(request, auth, "member:read");
  if (memberForbidden) return memberForbidden;
  const profileForbidden = requirePermission(request, auth, "profile:read");
  if (profileForbidden) return profileForbidden;
  const member = await memberScope(request, auth, (await context.params).id);
  if (member instanceof Response) return member;
  if (!member) return apiResponse(request, { code: ApiCode.NOT_FOUND, message: "资源不存在", data: null, status: 404 });
  return apiSuccess(request, await detailDto(request, auth, member));
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireCurrentEmployee(request);
  if (auth instanceof Response) return auth;
  const memberForbidden = requirePermission(request, auth, "member:write");
  if (memberForbidden) return memberForbidden;
  const profileForbidden = requirePermission(request, auth, "profile:write");
  if (profileForbidden) return profileForbidden;
  const parsed = updateMemberSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(request, `参数错误：${parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join("；")}`);
  const current = await memberScope(request, auth, (await context.params).id);
  if (current instanceof Response) return current;
  if (!current) return apiResponse(request, { code: ApiCode.NOT_FOUND, message: "资源不存在", data: null, status: 404 });
  const editForbidden = await requireMemberEditScope(request, auth, current);
  if (editForbidden) return editForbidden;
  if (parsed.data.phone !== undefined) {
    const contactForbidden = requireMemberContactEditScope(request, auth, current);
    if (contactForbidden) return contactForbidden;
  }
  const birthDate = parsed.data.birthDate === undefined ? undefined : (parsed.data.birthDate === null ? null : normalizeBirthDate(parsed.data.birthDate));
  if (parsed.data.birthDate !== undefined && parsed.data.birthDate !== null && !birthDate) return validationError(request, "参数错误：birthDate 无效");
  if (parsed.data.ageMin !== undefined && parsed.data.ageMax !== undefined && parsed.data.ageMin !== null && parsed.data.ageMax !== null && parsed.data.ageMin > parsed.data.ageMax) return validationError(request, "参数错误：最小年龄不能大于最大年龄");
  if (parsed.data.heightMinCm !== undefined && parsed.data.heightMaxCm !== undefined && parsed.data.heightMinCm !== null && parsed.data.heightMaxCm !== null && parsed.data.heightMinCm > parsed.data.heightMaxCm) return validationError(request, "参数错误：最低身高不能大于最高身高");
  if (parsed.data.ownerEmployeeId && parsed.data.ownerEmployeeId !== current.ownerEmployeeId) {
    const owner = await prisma.employee.findFirst({ where: { id: parsed.data.ownerEmployeeId, storeId: current.storeId, status: "ACTIVE" }, select: { id: true } });
    if (!owner) return validationError(request, "归属员工不存在或不属于当前门店");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const data: Prisma.MemberUpdateInput = {
      updatedBy: actorEmployeeId(auth) ? { connect: { id: actorEmployeeId(auth)! } } : { disconnect: true },
      ...(parsed.data.ownerEmployeeId ? { owner: { connect: { id: parsed.data.ownerEmployeeId } } } : {}),
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.gender !== undefined ? { gender: parsed.data.gender } : {}),
      ...(birthDate !== undefined ? { birthDate } : {}),
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      ...(parsed.data.heightCm !== undefined ? { heightCm: parsed.data.heightCm } : {}),
      ...(parsed.data.weightKg !== undefined ? { weightKg: parsed.data.weightKg } : {}),
      ...(parsed.data.education !== undefined ? { education: parsed.data.education } : {}),
      ...(parsed.data.maritalStatus !== undefined ? { maritalStatus: parsed.data.maritalStatus } : {}),
      ...(parsed.data.occupation !== undefined ? { occupation: parsed.data.occupation } : {}),
      ...(parsed.data.incomeRange !== undefined ? { incomeRange: parsed.data.incomeRange } : {}),
      ...(parsed.data.hometownProvince !== undefined ? { hometownProvince: parsed.data.hometownProvince } : {}),
      ...(parsed.data.hometownCity !== undefined ? { hometownCity: parsed.data.hometownCity } : {}),
      ...(parsed.data.hometownDistrict !== undefined ? { hometownDistrict: parsed.data.hometownDistrict } : {}),
      ...(parsed.data.currentProvince !== undefined ? { currentProvince: parsed.data.currentProvince } : {}),
      ...(parsed.data.currentCity !== undefined ? { currentCity: parsed.data.currentCity } : {}),
      ...(parsed.data.currentDistrict !== undefined ? { currentDistrict: parsed.data.currentDistrict } : {}),
      ...(parsed.data.housingStatus !== undefined ? { housingStatus: parsed.data.housingStatus } : {}),
      ...(parsed.data.vehicleStatus !== undefined ? { vehicleStatus: parsed.data.vehicleStatus } : {}),
    };
    if (parsed.data.phone !== undefined) {
      const phone = parsed.data.phone ? normalizePhone(parsed.data.phone) : null;
      data.sensitiveInfo = { upsert: { create: { storeId: current.storeId, phoneEncrypted: phone ? encryptSensitiveValue(phone) : null, phoneHash: phone ? hashSensitiveValue(phone) : null }, update: { phoneEncrypted: phone ? encryptSensitiveValue(phone) : null, phoneHash: phone ? hashSensitiveValue(phone) : null } } };
    }
    if (parsed.data.hobbies !== undefined || parsed.data.selfDescription !== undefined) {
      data.extraProfile = { upsert: { create: { storeId: current.storeId, hobbies: parsed.data.hobbies ?? null, selfDescription: parsed.data.selfDescription ?? null }, update: { ...(parsed.data.hobbies !== undefined ? { hobbies: parsed.data.hobbies } : {}), ...(parsed.data.selfDescription !== undefined ? { selfDescription: parsed.data.selfDescription } : {}) } } };
    }
    const preferenceFields = ["ageMin", "ageMax", "genderPreference", "educationRequirement", "incomeMinAnnual", "heightMinCm", "heightMaxCm", "maritalStatusRequirements", "hasHousing", "hasVehicle", "smokingPreference", "drinkingPreference"] as const;
    if (preferenceFields.some((field) => parsed.data[field] !== undefined)) {
      data.matePreference = { upsert: {
        create: { storeId: current.storeId, ageMin: parsed.data.ageMin ?? null, ageMax: parsed.data.ageMax ?? null, genderPreference: parsed.data.genderPreference ?? "OPPOSITE", educationRequirement: parsed.data.educationRequirement ?? null, incomeMinAnnual: parsed.data.incomeMinAnnual ?? null, heightMinCm: parsed.data.heightMinCm ?? null, heightMaxCm: parsed.data.heightMaxCm ?? null, maritalStatusRequirements: parsed.data.maritalStatusRequirements ?? [], hasHousing: parsed.data.hasHousing ?? null, hasVehicle: parsed.data.hasVehicle ?? null, smokingPreference: parsed.data.smokingPreference ?? null, drinkingPreference: parsed.data.drinkingPreference ?? null },
        update: Object.fromEntries(preferenceFields.filter((field) => parsed.data[field] !== undefined).map((field) => [field, parsed.data[field]])),
      } };
    }
    const member = await tx.member.update({ where: { id: current.id }, data, include: readInclude });
    await writeAuditLog(tx, request, auth, { storeId: current.storeId, action: "UPDATE", resourceType: "Member", resourceId: current.id, before: { status: current.status, ownerEmployeeId: current.ownerEmployeeId }, after: { status: member.status, ownerEmployeeId: member.ownerEmployeeId }, metadata: { changedFields: Object.keys(parsed.data) } });
    return member;
  });
  return apiSuccess(request, await detailDto(request, auth, updated), "更新成功");
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireCurrentEmployee(request);
  if (auth instanceof Response) return auth;
  const forbidden = requirePermission(request, auth, "member:delete");
  if (forbidden) return forbidden;
  const current = await memberScope(request, auth, (await context.params).id);
  if (current instanceof Response) return current;
  if (!current) return apiResponse(request, { code: ApiCode.NOT_FOUND, message: "资源不存在", data: null, status: 404 });
  const editForbidden = await requireMemberEditScope(request, auth, current);
  if (editForbidden) return editForbidden;
  await prisma.$transaction(async (tx) => {
    await tx.member.delete({ where: { id: current.id } });
    await writeAuditLog(tx, request, auth, { storeId: current.storeId, action: "DELETE", resourceType: "Member", resourceId: current.id, before: { memberNo: current.memberNo, status: current.status } });
  });
  return apiSuccess(request, { id: current.id }, "删除成功");
}
