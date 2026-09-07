import type { Member, Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiCode, apiResponse, apiSuccess } from "@/lib/server/api-response";
import { prisma } from "@/lib/server/prisma";
import { memberProfileView } from "@/lib/server/member-profile-view";
import {
  actorEmployeeId,
  canViewMemberIdentity,
  requireMemberContactEditScope,
  requireMemberEditScope,
  requireCurrentEmployee,
  requirePermission,
  writeAuditLog,
} from "@/lib/server/route-helpers";
import {
  decryptSensitivePlaceholder,
  maskEmail,
  maskPhone,
} from "@/lib/server/sensitive-fields";

const genders = ["MALE", "FEMALE", "OTHER", "UNKNOWN"] as const;
const memberStatuses = [
  "LEAD",
  "ACTIVE",
  "MATCHING",
  "PAUSED",
  "MARRIED",
  "REFUNDED",
  "BLACKLISTED",
  "ARCHIVED",
] as const;
const incomeRanges = ["保密", "10万以下", "10-20万", "20-30万", "30-50万", "50-100万", "100万以上"] as const;

const updateMemberSchema = z.object({
  storeId: z.string().trim().min(1).max(80).optional(),
  ownerEmployeeId: z.string().trim().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().min(5).max(32).nullable().optional(),
  gender: z.enum(genders).optional(),
  birthDate: z.string().datetime({ offset: true }).nullable().optional(),
  status: z.enum(memberStatuses).optional(),
  source: z.string().trim().max(80).nullable().optional(),
  heightCm: z.number().int().min(80).max(260).nullable().optional(),
  weightKg: z.number().int().min(20).max(300).nullable().optional(),
  education: z.string().trim().max(80).nullable().optional(),
  maritalStatus: z.string().trim().max(40).nullable().optional(),
  occupation: z.string().trim().max(40).nullable().optional(),
  incomeRange: z.enum(incomeRanges).nullable().optional(),
  hometown: z.string().trim().max(40).nullable().optional(),
  currentCity: z.string().trim().max(40).nullable().optional(),
  hometownProvince: z.string().trim().max(20).nullable().optional(),
  hometownCity: z.string().trim().max(20).nullable().optional(),
  hometownDistrict: z.string().trim().max(20).nullable().optional(),
  currentProvince: z.string().trim().max(20).nullable().optional(),
  currentDistrict: z.string().trim().max(20).nullable().optional(),
  housingStatus: z.string().trim().max(40).nullable().optional(),
  vehicleStatus: z.string().trim().max(40).nullable().optional(),
  familyBackground: z.string().trim().max(500).nullable().optional(),
  selfDescription: z.string().trim().max(500).nullable().optional(),
  matePreference: z.string().trim().max(500).nullable().optional(),
  ageMin: z.number().int().min(18).max(100).nullable().optional(), ageMax: z.number().int().min(18).max(100).nullable().optional(),
  genderPreference: z.enum(["OPPOSITE", "MALE", "FEMALE", "ANY", "OTHER"]).optional(),
  educationRequirement: z.string().trim().max(80).nullable().optional(), incomeMinAnnual: z.number().int().min(0).nullable().optional(),
  heightMinCm: z.number().int().min(80).max(260).nullable().optional(), heightMaxCm: z.number().int().min(80).max(260).nullable().optional(),
  maritalStatusRequirements: z.array(z.string().trim().max(40)).optional(), hasHousing: z.boolean().nullable().optional(), hasVehicle: z.boolean().nullable().optional(),
  smokingPreference: z.string().trim().max(40).nullable().optional(), drinkingPreference: z.string().trim().max(40).nullable().optional(),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

type MemberDetail = Member & {
  owner: { name: string } | null;
};

function validationError(request: Request, detail?: string) {
  return apiResponse(request, {
    code: ApiCode.BAD_REQUEST,
    message: detail ? `参数错误：${detail}` : "参数错误",
    data: null,
    status: 400,
  });
}

async function getMemberId(context: RouteContext) {
  return (await context.params).id;
}

function memberToDetail(member: MemberDetail, canViewIdentity: boolean) {
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
    emailMasked: maskEmail(null),
    gender: member.gender,
    birthDate: member.birthDate,
    status: member.status,
    storeId: member.storeId,
    ownerEmployeeId: member.ownerEmployeeId,
    ownerName: member.owner?.name ?? null,
    source: member.source,
    blacklistedAt: member.blacklistedAt?.toISOString() ?? null,
    profile: {
      heightCm: profile.heightCm,
      weightKg: profile.weightKg,
      education: profile.education,
      maritalStatus: profile.maritalStatus,
      occupation: profile.occupation,
      incomeRange: profile.incomeRange,
      hometown: profile.hometown,
      currentCity: profile.currentCity,
      hometownProvince: member.hometownProvince,
      hometownCity: member.hometownCity,
      hometownDistrict: member.hometownDistrict,
      currentProvince: member.currentProvince,
      currentDistrict: member.currentDistrict,
      housingStatus: profile.housingStatus,
      vehicleStatus: profile.vehicleStatus,
      familyBackground: profile.familyBackground,
      selfDescription: profile.selfDescription,
      matePreference: profile.matePreference,
      expectationSummary: profile.matePreference,
      profileCompletenessPercent: profile.profileCompletenessPercent,
      updatedAt: member.updatedAt.toISOString(),
    },
    matePreferenceDetails: member.matePreference ?? null,
    documents: [],
    followups: [],
    blacklistEntries: [],
    createdAt: member.createdAt.toISOString(),
    updatedAt: member.updatedAt.toISOString(),
  };
}

function calculateCompleteness(input: {
  name: string;
  phoneEncrypted: string | null;
  gender: Member["gender"];
  birthDate: string | null;
  education: string | null;
  heightCm: number | null;
  maritalStatus: string | null;
}) {
  const fields = [
    input.name,
    input.phoneEncrypted,
    input.gender !== "UNKNOWN" ? input.gender : undefined,
    input.birthDate,
    input.education,
    input.heightCm,
    input.maritalStatus,
  ];
  const completed = fields.filter((field) => field !== undefined && field !== null && field !== "").length;

  return Math.round((completed / fields.length) * 100);
}

async function loadMemberOrResponse(
  request: Request,
  id: string,
  storeId?: string,
) {
  const member = await prisma.member.findFirst({
    where: { id, ...(storeId ? { storeId } : {}) },
    include: { owner: { select: { name: true } }, matePreference: true, extraProfile: true },
  });

  if (!member) {
    return apiResponse(request, {
      code: ApiCode.NOT_FOUND,
      message: "资源不存在",
      data: null,
      status: 404,
    });
  }

  return member;
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireCurrentEmployee(request);

  if (auth instanceof Response) {
    return auth;
  }

  const memberForbidden = requirePermission(request, auth, "member:read");
  if (memberForbidden) {
    return memberForbidden;
  }

  const profileForbidden = requirePermission(request, auth, "profile:read");
  if (profileForbidden) {
    return profileForbidden;
  }

  const member = await loadMemberOrResponse(request, await getMemberId(context));

  if (member instanceof Response) {
    return member;
  }

  const auditLogs = await prisma.auditLog.findMany({
    where: {
      storeId: member.storeId,
      OR: [
        { resourceType: "Member", resourceId: member.id },
      ],
    },
    include: { actorEmployee: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return apiSuccess(request, {
    ...memberToDetail(member, canViewMemberIdentity(auth, member)),
    auditLogs: auditLogs.map((item) => ({
      id: item.id,
      action: item.action,
      resourceType: item.resourceType,
      resourceId: item.resourceId,
      actorName: item.actorEmployee?.name ?? null,
      metadataJson: item.metadataJson,
      createdAt: item.createdAt.toISOString(),
    })),
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireCurrentEmployee(request);

  if (auth instanceof Response) {
    return auth;
  }

  const memberForbidden = requirePermission(request, auth, "member:write");
  if (memberForbidden) {
    return memberForbidden;
  }

  const profileForbidden = requirePermission(request, auth, "profile:write");
  if (profileForbidden) {
    return profileForbidden;
  }

  const body = await request.json().catch(() => null);
  const parsed = updateMemberSchema.safeParse(body);

  if (!parsed.success) {
    return validationError(request, parsed.error.issues.map((issue) => `${issue.path.join(".") || "body"} ${issue.message}`).join("；"));
  }

  const id = await getMemberId(context);
  const current = await loadMemberOrResponse(request, id);

  if (current instanceof Response) {
    return current;
  }

  const editForbidden = await requireMemberEditScope(request, auth, current);

  if (editForbidden) {
    return editForbidden;
  }

  if (parsed.data.phone !== undefined) {
    const contactEditForbidden = requireMemberContactEditScope(request, auth, current);

    if (contactEditForbidden) {
      return contactEditForbidden;
    }
  }

  const scope = { storeId: current.storeId };

  if (parsed.data.storeId && parsed.data.storeId !== current.storeId) {
    return apiResponse(request, {
      code: ApiCode.FORBIDDEN,
      message: "不能通过会员编辑直接调整门店",
      data: null,
      status: 403,
    });
  }

  if (parsed.data.ownerEmployeeId) {
    const owner = await prisma.employee.findFirst({
      where: {
        id: parsed.data.ownerEmployeeId,
        storeId: scope.storeId,
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
  }

  // BlacklistEntry is not part of the current database schema.
  const blacklistBlock = null;

  if (blacklistBlock) {
    await writeAuditLog(prisma, request, auth, {
      storeId: scope.storeId,
      action: "BLACKLIST_BLOCK",
      resourceType: "Member",
      resourceId: current.id,
      metadata: {
        entryId: blacklistBlock.id,
        reason: blacklistBlock.reason,
        severity: blacklistBlock.severity,
        operation: "member.update",
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

  const memberData: Prisma.MemberUpdateInput = {
    updatedBy: actorEmployeeId(auth)
      ? { connect: { id: actorEmployeeId(auth) ?? "" } }
      : { disconnect: true },
  };

  if (parsed.data.ownerEmployeeId) {
    memberData.owner = { connect: { id: parsed.data.ownerEmployeeId } };
  }

  if (parsed.data.name) {
    memberData.name = parsed.data.name;
  }

  // Contact fields now live in MemberSensitiveInfo and are not updated here.

  if (parsed.data.birthDate !== undefined) {
    memberData.birthDate = parsed.data.birthDate;
  }

  if (parsed.data.gender) {
    memberData.gender = parsed.data.gender;
  }

  if (parsed.data.status) {
    memberData.status = parsed.data.status;
  }

  const profileFields = {
    heightCm: parsed.data.heightCm,
    weightKg: parsed.data.weightKg,
    education: parsed.data.education,
    maritalStatus: parsed.data.maritalStatus,
    occupation: parsed.data.occupation,
    incomeRange: parsed.data.incomeRange,
    hometown: parsed.data.hometown,
    currentCity: parsed.data.currentCity,
    hometownProvince: parsed.data.hometownProvince,
    hometownCity: parsed.data.hometownCity,
    hometownDistrict: parsed.data.hometownDistrict,
    currentProvince: parsed.data.currentProvince,
    currentDistrict: parsed.data.currentDistrict,
    housingStatus: parsed.data.housingStatus,
    vehicleStatus: parsed.data.vehicleStatus,
    selfDescription: parsed.data.selfDescription,
  };
  const hasProfileUpdates = Object.values(profileFields).some((value) => value !== undefined);

  const updated = await prisma.$transaction(async (tx) => {
    const member = await tx.member.update({
      where: { id: current.id },
      data: {
        ...memberData,
        ...(hasProfileUpdates ? {
          ...(parsed.data.heightCm !== undefined ? { heightCm: parsed.data.heightCm } : {}),
          ...(parsed.data.weightKg !== undefined ? { weightKg: parsed.data.weightKg } : {}),
          ...(parsed.data.education !== undefined ? { education: parsed.data.education } : {}),
          ...(parsed.data.maritalStatus !== undefined ? { maritalStatus: parsed.data.maritalStatus } : {}),
          ...(parsed.data.occupation !== undefined ? { occupation: parsed.data.occupation } : {}),
          ...(parsed.data.incomeRange !== undefined ? { incomeRange: parsed.data.incomeRange } : {}),
          ...(parsed.data.hometown !== undefined ? { hometown: parsed.data.hometown } : {}),
          ...(parsed.data.currentCity !== undefined ? { currentCity: parsed.data.currentCity } : {}),
          ...(parsed.data.hometownProvince !== undefined ? { hometownProvince: parsed.data.hometownProvince } : {}),
          ...(parsed.data.hometownCity !== undefined ? { hometownCity: parsed.data.hometownCity } : {}),
          ...(parsed.data.hometownDistrict !== undefined ? { hometownDistrict: parsed.data.hometownDistrict } : {}),
          ...(parsed.data.currentProvince !== undefined ? { currentProvince: parsed.data.currentProvince } : {}),
          ...(parsed.data.currentDistrict !== undefined ? { currentDistrict: parsed.data.currentDistrict } : {}),
          ...(parsed.data.housingStatus !== undefined ? { housingStatus: parsed.data.housingStatus } : {}),
          ...(parsed.data.vehicleStatus !== undefined ? { vehicleStatus: parsed.data.vehicleStatus } : {}),
          ...(parsed.data.selfDescription !== undefined ? { selfDescription: parsed.data.selfDescription } : {}),
        } : {}),
      },
      include: {
        owner: { select: { name: true } },
      },
    });

    const completeness = calculateCompleteness({
      name: member.name,
      phoneEncrypted: member.phoneEncrypted,
      gender: member.gender,
      birthDate: member.birthDate,
      education: member.education,
      heightCm: member.heightCm,
      maritalStatus: member.maritalStatus,
    });

    const preferenceFields = ["ageMin", "ageMax", "genderPreference", "educationRequirement", "incomeMinAnnual", "heightMinCm", "heightMaxCm", "maritalStatusRequirements", "hasHousing", "hasVehicle", "smokingPreference", "drinkingPreference"];
    if (preferenceFields.some((field) => parsed.data[field] !== undefined)) {
      await tx.memberMatePreference.upsert({
        where: { memberId: current.id },
        create: { memberId: current.id, storeId: current.storeId, ageMin: parsed.data.ageMin ?? null, ageMax: parsed.data.ageMax ?? null, genderPreference: parsed.data.genderPreference ?? "OPPOSITE", educationRequirement: parsed.data.educationRequirement ?? null, incomeMinAnnual: parsed.data.incomeMinAnnual ?? null, heightMinCm: parsed.data.heightMinCm ?? null, heightMaxCm: parsed.data.heightMaxCm ?? null, maritalStatusRequirements: parsed.data.maritalStatusRequirements ?? [], hasHousing: parsed.data.hasHousing ?? null, hasVehicle: parsed.data.hasVehicle ?? null, smokingPreference: parsed.data.smokingPreference ?? null, drinkingPreference: parsed.data.drinkingPreference ?? null },
        update: Object.fromEntries(preferenceFields.filter((field) => parsed.data[field] !== undefined).map((field) => [field, parsed.data[field]])),
      });
    }

    const memberWithCompleteness =
      member.profileCompletenessPercent === completeness
        ? member
        : await tx.member.update({
            where: { id: member.id },
            data: { profileCompletenessPercent: completeness },
            include: {
              owner: { select: { name: true } },
            },
          });

    await writeAuditLog(tx, request, auth, {
      storeId: scope.storeId,
      action: "UPDATE",
      resourceType: "Member",
      resourceId: current.id,
      before: {
        status: current.status,
        ownerEmployeeId: current.ownerEmployeeId,
        profileCompletenessPercent: current.profileCompletenessPercent,
      },
      after: {
        status: memberWithCompleteness.status,
        ownerEmployeeId: memberWithCompleteness.ownerEmployeeId,
        profileCompletenessPercent: memberWithCompleteness.profileCompletenessPercent,
      },
      metadata: {
        changedFields: Object.keys(parsed.data),
      },
    });

    return memberWithCompleteness;
  });

  return apiSuccess(request, memberToDetail(updated, canViewMemberIdentity(auth, updated)), "更新成功");
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireCurrentEmployee(request);

  if (auth instanceof Response) {
    return auth;
  }

  const forbidden = requirePermission(request, auth, "member:delete");
  if (forbidden) {
    return forbidden;
  }

  const id = await getMemberId(context);
  const current = await prisma.member.findFirst({
    where: { id },
    select: {
      id: true,
      storeId: true,
      ownerEmployeeId: true,
      memberNo: true,
      name: true,
      status: true,
    },
  });

  if (!current) {
    return apiResponse(request, {
      code: ApiCode.NOT_FOUND,
      message: "资源不存在",
      data: null,
      status: 404,
    });
  }

  const editForbidden = await requireMemberEditScope(request, auth, current);

  if (editForbidden) {
    return editForbidden;
  }

  await prisma.$transaction(async (tx) => {
    await tx.member.delete({ where: { id: current.id } });

    await writeAuditLog(tx, request, auth, {
      storeId: current.storeId,
      action: "DELETE",
      resourceType: "Member",
      resourceId: current.id,
      before: {
        memberNo: current.memberNo,
        name: current.name,
        status: current.status,
        ownerEmployeeId: current.ownerEmployeeId,
      },
      metadata: {
        memberNo: current.memberNo,
      },
    });
  });

  return apiSuccess(request, { id: current.id }, "删除成功");
}
