import type { Prisma } from "@prisma/client";
import { hasPermission } from "@/business-support/permissions/permissions";
import { prisma } from "@/lib/server/prisma";
import type { AuthContext } from "@/lib/server/route-helpers";

export type ToolContext = { auth: AuthContext; memberOwnerId?: string };
export type MemberProfileField =
  | "memberNo"
  | "name"
  | "age"
  | "gender"
  | "hometown"
  | "currentLocation"
  | "occupation"
  | "education"
  | "hobbies"
  | "status"
  | "profileCompletenessPercent";
export type GetMemberProfileInput = { memberId: string; fields?: MemberProfileField[] };
export type MemberMatePreferenceField =
  | "ageMin"
  | "ageMax"
  | "genderPreference"
  | "educationRequirement"
  | "incomeMinAnnual"
  | "heightMinCm"
  | "heightMaxCm"
  | "maritalStatusRequirements"
  | "hasHousing"
  | "hasVehicle"
  | "smokingPreference"
  | "drinkingPreference";
export type GetMemberMatePreferenceInput = { memberId: string; fields?: MemberMatePreferenceField[] };
export type MemberSearchInput = {
  keyword?: string;
  ageMin?: number;
  ageMax?: number;
  gender?: "MALE" | "FEMALE" | "OTHER" | "UNKNOWN";
  currentProvinceCode?: string;
  currentCityCode?: string;
  currentDistrictCode?: string;
  hometownProvinceCode?: string;
  hometownCityCode?: string;
  hometownDistrictCode?: string;
  occupation?: string;
  education?: string;
  incomeRange?: string;
  page?: number;
  pageSize?: number;
};
export type MemberSearchItem = {
  memberId: string;
  name: string;
  age: number | null;
  gender: string;
  occupation: string | null;
  education: string | null;
  currentLocation: { province: string | null; city: string | null; district: string | null };
};

function assertPermission(context: ToolContext, permission: "member:read" | "profile:read") {
  if (!context.auth.isBootstrapAdmin && !hasPermission(context.auth.employee.permissions, permission)) {
    throw new Error("无权限");
  }
}

/** Shared CRM derivation. Invalid text dates produce null rather than guessed ages. */
export function deriveMemberAge(birthDate: string | null, today = new Date()): number | null {
  if (!birthDate) return null;
  const datePart = birthDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  const date = new Date(`${datePart}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== datePart) return null;
  let age = today.getUTCFullYear() - date.getUTCFullYear();
  if (today < new Date(Date.UTC(today.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))) {
    age -= 1;
  }
  return age;
}

function summary(member: {
  id: string;
  memberNo: string;
  name: string;
  birthDate: string | null;
  gender: string;
  hometownProvince: string | null;
  hometownCity: string | null;
  hometownDistrict: string | null;
  currentProvince: string | null;
  currentCity: string | null;
  currentDistrict: string | null;
  occupation: string | null;
  education: string | null;
  status: string;
  profileCompletenessPercent: number;
  extraProfile?: { hobbies: string | null; storeId: string } | null;
  storeId: string;
}) {
  return {
    id: member.id,
    memberNo: member.memberNo,
    name: member.name,
    age: deriveMemberAge(member.birthDate),
    gender: member.gender,
    hometown: {
      province: member.hometownProvince,
      city: member.hometownCity,
      district: member.hometownDistrict,
    },
    currentLocation: {
      province: member.currentProvince,
      city: member.currentCity,
      district: member.currentDistrict,
    },
    occupation: member.occupation,
    education: member.education,
    // A mismatched extension row is not trusted, even for regular CRM callers.
    hobbies: member.extraProfile?.storeId === member.storeId ? member.extraProfile.hobbies : null,
    status: member.status,
    profileCompletenessPercent: member.profileCompletenessPercent,
  };
}

export async function getMemberProfile(
  context: ToolContext,
  input: GetMemberProfileInput,
): Promise<Partial<ReturnType<typeof summary>> & { id: string }> {
  assertPermission(context, "member:read");
  const member = await prisma.member.findFirst({
    where: {
      id: input.memberId,
      storeId: context.auth.employeeStoreId ?? undefined,
      ...(context.memberOwnerId ? { ownerEmployeeId: context.memberOwnerId } : {}),
    },
    include: { extraProfile: { select: { hobbies: true, storeId: true } } },
  });
  if (!member) throw new Error("会员不存在");

  const full = summary(member);
  const defaultFields: MemberProfileField[] = [
    "name",
    "age",
    "gender",
    "currentLocation",
    "occupation",
    "education",
  ];
  const fields = input.fields?.length ? input.fields : defaultFields;
  const selected = full as Record<MemberProfileField, unknown>;
  return {
    id: member.id,
    ...Object.fromEntries(fields.map((field) => [field, selected[field]])),
  } as Partial<ReturnType<typeof summary>> & { id: string };
}

function matePreferenceSummary(preference: {
  ageMin: number | null;
  ageMax: number | null;
  genderPreference: string;
  educationRequirement: string | null;
  incomeMinAnnual: number | null;
  heightMinCm: number | null;
  heightMaxCm: number | null;
  maritalStatusRequirements: string[];
  hasHousing: boolean | null;
  hasVehicle: boolean | null;
  smokingPreference: string | null;
  drinkingPreference: string | null;
}) {
  return {
    ageMin: preference.ageMin,
    ageMax: preference.ageMax,
    genderPreference: preference.genderPreference,
    educationRequirement: preference.educationRequirement,
    incomeMinAnnual: preference.incomeMinAnnual,
    heightMinCm: preference.heightMinCm,
    heightMaxCm: preference.heightMaxCm,
    maritalStatusRequirements: preference.maritalStatusRequirements,
    hasHousing: preference.hasHousing,
    hasVehicle: preference.hasVehicle,
    smokingPreference: preference.smokingPreference,
    drinkingPreference: preference.drinkingPreference,
  };
}

export async function getMemberMatePreference(
  context: ToolContext,
  input: GetMemberMatePreferenceInput,
): Promise<(Partial<ReturnType<typeof matePreferenceSummary>> & { memberId: string }) | null> {
  assertPermission(context, "member:read");
  const member = await prisma.member.findFirst({
    where: {
      id: input.memberId,
      storeId: context.auth.employeeStoreId ?? undefined,
      ...(context.memberOwnerId ? { ownerEmployeeId: context.memberOwnerId } : {}),
    },
    select: { id: true, storeId: true },
  });
  if (!member) throw new Error("会员不存在");

  const preference = await prisma.memberMatePreference.findFirst({
    where: { memberId: member.id, storeId: member.storeId },
  });
  if (!preference) return null;

  const full = matePreferenceSummary(preference);
  const fields = input.fields?.length
    ? input.fields
    : (Object.keys(full) as MemberMatePreferenceField[]);
  const selected = full as Record<MemberMatePreferenceField, unknown>;
  return {
    memberId: member.id,
    ...Object.fromEntries(fields.map((field) => [field, selected[field]])),
  } as Partial<ReturnType<typeof matePreferenceSummary>> & { memberId: string };
}

/**
 * The sole deterministic member-search repository used by both CRM tooling and
 * the Phase 1 Agent adapter. Agent callers inject owner scope through ToolContext.
 */
export async function searchMembers(context: ToolContext, input: MemberSearchInput) {
  assertPermission(context, "member:read");
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 20));
  const where: Prisma.MemberWhereInput = {
    storeId: context.auth.employeeStoreId ?? undefined,
    ...(input.gender ? { gender: input.gender } : {}),
    ...(input.occupation
      ? { occupation: { contains: input.occupation, mode: "insensitive" } }
      : {}),
    ...(input.education ? { education: { equals: input.education, mode: "insensitive" } } : {}),
    ...(input.incomeRange
      ? { incomeRange: { equals: input.incomeRange, mode: "insensitive" } }
      : {}),
    ...(input.currentProvinceCode ? { currentProvince: input.currentProvinceCode } : {}),
    ...(input.currentCityCode ? { currentCity: input.currentCityCode } : {}),
    ...(input.currentDistrictCode ? { currentDistrict: input.currentDistrictCode } : {}),
    ...(input.hometownProvinceCode ? { hometownProvince: input.hometownProvinceCode } : {}),
    ...(input.hometownCityCode ? { hometownCity: input.hometownCityCode } : {}),
    ...(input.hometownDistrictCode ? { hometownDistrict: input.hometownDistrictCode } : {}),
    ...(input.keyword
      ? {
          OR: [
            { name: { contains: input.keyword, mode: "insensitive" } },
            { memberNo: { contains: input.keyword, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  if (context.memberOwnerId) where.ownerEmployeeId = context.memberOwnerId;

  const allItems = await prisma.member.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      birthDate: true,
      gender: true,
      occupation: true,
      education: true,
      currentProvince: true,
      currentCity: true,
      currentDistrict: true,
    },
  });
  const filtered = allItems.filter((item) => {
    const age = deriveMemberAge(item.birthDate);
    return (
      (input.ageMin === undefined || (age !== null && age >= input.ageMin)) &&
      (input.ageMax === undefined || (age !== null && age <= input.ageMax))
    );
  });
  const total = filtered.length;
  const items: MemberSearchItem[] = filtered
    .slice((page - 1) * pageSize, page * pageSize)
    .map((item) => ({
      memberId: item.id,
      name: item.name,
      age: deriveMemberAge(item.birthDate),
      gender: item.gender,
      occupation: item.occupation,
      education: item.education,
      currentLocation: {
        province: item.currentProvince,
        city: item.currentCity,
        district: item.currentDistrict,
      },
    }));
  return { items, page, pageSize, total, hasNext: page * pageSize < total };
}
