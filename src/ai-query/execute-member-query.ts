import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import { hashSensitiveValue } from "@/lib/server/sensitive-fields";
import { deriveMemberAge } from "@/business-support/tools/member/member-tools";
import { AreaResolver, type ResolvedArea } from "@/agent-system/gateway/area-resolver";
import { applicationTrace } from "@/agent-system/tracing/application-trace";
import type { MemberFilter, MemberQuery } from "./member-query-contract";
import { memberQuerySchema } from "./member-query-contract";
import { MEMBER_QUERY_FIELDS, type MemberQueryableField } from "./member-query-fields";

export type AuthorizedMemberQueryScope = {
  storeId: string;
  ownerEmployeeId?: string;
  traceId: string;
};

export type MemberQueryStop = {
  status: "ValidationError" | "ClarificationRequired";
  message: string;
  details?: unknown;
};

export type MemberQueryResult = {
  task: MemberQuery["task"];
  items: Array<{
    id: string;
    memberNo: string;
    name: string;
    age: number | null;
    gender: string;
    status: string;
    heightCm: number | null;
    weightKg: number | null;
    occupation: string | null;
    education: string | null;
    maritalStatus: string | null;
    currentLocation: { province: string | null; city: string | null; district: string | null };
    profileCompletenessPercent: number;
  }>;
  page: number;
  pageSize: number;
  total: number;
  hasNext: boolean;
};

type QueryMember = {
  id: string;
  storeId: string;
  ownerEmployeeId: string;
  memberNo: string;
  name: string;
  gender: string;
  birthDate: string | null;
  status: string;
  heightCm: number | null;
  weightKg: number | null;
  education: string | null;
  occupation: string | null;
  incomeRange: string | null;
  maritalStatus: string | null;
  housingStatus: string | null;
  vehicleStatus: string | null;
  hometownProvince: string | null;
  hometownCity: string | null;
  hometownDistrict: string | null;
  currentProvince: string | null;
  currentCity: string | null;
  currentDistrict: string | null;
  profileCompletenessPercent: number;
  extraProfile: { storeId: string; hobbies: string | null; selfDescription: string | null } | null;
};

const select = {
  id: true,
  storeId: true,
  ownerEmployeeId: true,
  memberNo: true,
  name: true,
  gender: true,
  birthDate: true,
  status: true,
  heightCm: true,
  weightKg: true,
  education: true,
  occupation: true,
  incomeRange: true,
  maritalStatus: true,
  housingStatus: true,
  vehicleStatus: true,
  hometownProvince: true,
  hometownCity: true,
  hometownDistrict: true,
  currentProvince: true,
  currentCity: true,
  currentDistrict: true,
  profileCompletenessPercent: true,
  extraProfile: { select: { storeId: true, hobbies: true, selfDescription: true } },
} satisfies Prisma.MemberSelect;

/**
 * The only Query V2 executor. The caller supplies a server-derived scope; this
 * module never accepts operator, store, role, or permission data from the model.
 */
export async function executeMemberQuery(
  input: unknown,
  scope: AuthorizedMemberQueryScope,
  page = 1,
  pageSize = 20,
  areas = new AreaResolver(),
): Promise<MemberQueryResult | MemberQueryStop> {
  const parsed = memberQuerySchema.safeParse(input);
  applicationTrace.record(scope.traceId, "member_query_validation", parsed.success ? "passed" : "failed");
  if (!parsed.success) return { status: "ValidationError", message: "会员查询条件格式无效。" };
  if (parsed.data.unresolved.length > 0) {
    return {
      status: "ValidationError",
      message: "存在未解析条件，请修正或明确忽略后再查询。",
      details: { unresolved: parsed.data.unresolved },
    };
  }

  const resolved = await buildWhere(parsed.data.filters, scope, areas);
  if ("status" in resolved) return resolved;

  applicationTrace.record(scope.traceId, "member_query_execution_started", {
    task: parsed.data.task,
    filterFields: parsed.data.filters.map((filter) => filter.field),
  });
  const members = await prisma.member.findMany({
    where: resolved.where,
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    select,
  }) as QueryMember[];

  // Age is derived from the persisted birth date. All other filters are pushed
  // to Prisma; this small post-filter keeps age semantics correct without a new
  // denormalized database column.
  const scopedMembers = members
    .filter((member) => member.storeId === scope.storeId)
    .filter((member) => !scope.ownerEmployeeId || member.ownerEmployeeId === scope.ownerEmployeeId)
    .filter((member) => memberMatchesAge(member, parsed.data.filters));
  const total = scopedMembers.length;
  const normalizedPage = Math.max(1, page);
  const normalizedPageSize = Math.min(50, Math.max(1, pageSize));
  const items = scopedMembers
    .slice((normalizedPage - 1) * normalizedPageSize, normalizedPage * normalizedPageSize)
    .map(toPublicResult);

  applicationTrace.record(scope.traceId, "member_query_result_policy", {
    sourceRows: members.length,
    scopedRows: scopedMembers.length,
    returnedRows: items.length,
    removed: ["phone", "idCard", "phoneHash", "idCardHash", "encrypted"],
  });
  applicationTrace.record(scope.traceId, "member_query_execution_completed", { total, page: normalizedPage });
  return {
    task: parsed.data.task,
    items,
    page: normalizedPage,
    pageSize: normalizedPageSize,
    total,
    hasNext: normalizedPage * normalizedPageSize < total,
  };
}

async function buildWhere(
  filters: MemberFilter[],
  scope: AuthorizedMemberQueryScope,
  areas: AreaResolver,
): Promise<{ where: Prisma.MemberWhereInput } | MemberQueryStop> {
  const conditions: Prisma.MemberWhereInput[] = [
    { storeId: scope.storeId },
    ...(scope.ownerEmployeeId ? [{ ownerEmployeeId: scope.ownerEmployeeId }] : []),
  ];
  for (const filter of filters) {
    const definition = MEMBER_QUERY_FIELDS[filter.field];
    if (filter.field === "age") continue;
    if (definition.type === "area") {
      const area = await areas.resolve(String(filter.value));
      if ("status" in area) return { status: "ClarificationRequired", message: area.message, details: area.clarification };
      conditions.push(areaCondition(filter.field, area));
      continue;
    }
    if (filter.field === "phone" || filter.field === "idCard") {
      const hashField = filter.field === "phone" ? "phoneHash" : "idCardHash";
      conditions.push({ sensitiveInfo: { is: { storeId: scope.storeId, [hashField]: hashSensitiveValue(String(filter.value)) } } });
      continue;
    }
    if (filter.field === "hobbies" || filter.field === "selfDescription") {
      conditions.push({
        extraProfile: { is: { storeId: scope.storeId, [filter.field]: textFilter(filter) } },
      });
      continue;
    }
    conditions.push({ [filter.field]: scalarFilter(filter) });
  }
  return { where: { AND: conditions } };
}

function areaCondition(field: MemberQueryableField, area: ResolvedArea): Prisma.MemberWhereInput {
  const prefix = field.startsWith("hometown") ? "hometown" : "current";
  const suffix = area.level === "PROVINCE" ? "Province" : area.level === "CITY" ? "City" : "District";
  return { [`${prefix}${suffix}`]: area.code };
}

function scalarFilter(filter: MemberFilter): Prisma.StringFilter | Prisma.IntNullableFilter | string | undefined {
  const definition = MEMBER_QUERY_FIELDS[filter.field];
  if (definition.type === "number") {
    const [first, second] = Array.isArray(filter.value) ? filter.value : [filter.value];
    if (filter.op === "eq") return { equals: Number(first) };
    if (filter.op === "neq") return { not: Number(first) };
    if (filter.op === "gte") return { gte: Number(first) };
    if (filter.op === "lte") return { lte: Number(first) };
    if (filter.op === "between") return { gte: Number(first), lte: Number(second) };
  }
  if (definition.type === "enum") {
    if (filter.op === "in") return { in: filter.value as string[] } as never;
    if (filter.op === "neq") return { not: String(filter.value) } as never;
    return String(filter.value) as never;
  }
  return textFilter(filter);
}

function textFilter(filter: MemberFilter): Prisma.StringFilter {
  if (filter.op === "contains") return { contains: String(filter.value), mode: "insensitive" };
  if (filter.op === "in") return { in: filter.value as string[], mode: "insensitive" };
  if (filter.op === "neq") return { not: String(filter.value) };
  if (filter.op === "gte") return { gte: String(filter.value) };
  if (filter.op === "lte") return { lte: String(filter.value) };
  if (filter.op === "between") {
    const [min, max] = filter.value as string[];
    return { gte: min, lte: max };
  }
  return { equals: String(filter.value), mode: "insensitive" };
}

function memberMatchesAge(member: QueryMember, filters: MemberFilter[]) {
  const age = deriveMemberAge(member.birthDate);
  return filters.filter((filter) => filter.field === "age").every((filter) => {
    if (age === null) return false;
    const first = Number(Array.isArray(filter.value) ? filter.value[0] : filter.value);
    const second = Number(Array.isArray(filter.value) ? filter.value[1] : undefined);
    if (filter.op === "eq") return age === first;
    if (filter.op === "neq") return age !== first;
    if (filter.op === "gte") return age >= first;
    if (filter.op === "lte") return age <= first;
    if (filter.op === "between") return age >= first && age <= second;
    if (filter.op === "around") {
      const tolerance = MEMBER_QUERY_FIELDS.age.aroundTolerance ?? 0;
      return age >= first - tolerance && age <= first + tolerance;
    }
    return false;
  });
}

function toPublicResult(member: QueryMember): MemberQueryResult["items"][number] {
  return {
    id: member.id,
    memberNo: member.memberNo,
    name: member.name,
    age: deriveMemberAge(member.birthDate),
    gender: member.gender,
    status: member.status,
    heightCm: member.heightCm,
    weightKg: member.weightKg,
    occupation: member.occupation,
    education: member.education,
    maritalStatus: member.maritalStatus,
    currentLocation: {
      province: member.currentProvince,
      city: member.currentCity,
      district: member.currentDistrict,
    },
    profileCompletenessPercent: member.profileCompletenessPercent,
  };
}
