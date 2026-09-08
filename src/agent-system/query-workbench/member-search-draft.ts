import { z } from "zod";
import type { JsonRecord } from "../contracts/common-types";
import type { GatewayStop } from "../contracts/gateway-result";
import { AreaResolver, type ResolvedArea } from "../gateway/area-resolver";

const ageValue = z.number().int().min(18).max(100);
const unresolvedSchema = z.object({
  text: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(1).max(100),
}).strict();

export const memberSearchDraftSchema = z.object({
  age: z.union([
    z.object({ mode: z.literal("exact"), value: ageValue }).strict(),
    z.object({ mode: z.literal("bounds"), min: ageValue.optional(), max: ageValue.optional() })
      .strict()
      .refine((value) => value.min !== undefined || value.max !== undefined)
      .refine((value) => value.min === undefined || value.max === undefined || value.min <= value.max),
    z.object({ mode: z.literal("around"), value: ageValue }).strict(),
  ]).optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER", "UNKNOWN"]).optional(),
  currentLocation: z.string().trim().min(1).max(100).optional(),
  hometownLocation: z.string().trim().min(1).max(100).optional(),
  education: z.string().trim().min(1).max(100).optional(),
  occupation: z.string().trim().min(1).max(100).optional(),
  incomeRange: z.string().trim().min(1).max(100).optional(),
  pageSize: z.number().int().min(1).max(50).optional(),
  unresolved: z.array(unresolvedSchema).max(10).default([]),
}).strict();

export type MemberSearchDraft = z.infer<typeof memberSearchDraftSchema>;

const AGE_MIN = 18;
const AGE_MAX = 100;
const AROUND_TOLERANCE = 2;

export async function resolveMemberSearchDraft(
  input: unknown,
  areas = new AreaResolver(),
): Promise<{ filters: JsonRecord; draft: MemberSearchDraft } | GatewayStop> {
  const parsed = memberSearchDraftSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "ValidationError", message: "筛选条件格式无效。" };
  }

  const draft = parsed.data;
  const filters: JsonRecord = {};
  if (draft.age?.mode === "exact") {
    filters.ageMin = draft.age.value;
    filters.ageMax = draft.age.value;
  } else if (draft.age?.mode === "bounds") {
    if (draft.age.min !== undefined) filters.ageMin = draft.age.min;
    if (draft.age.max !== undefined) filters.ageMax = draft.age.max;
  } else if (draft.age?.mode === "around") {
    filters.ageMin = Math.max(AGE_MIN, draft.age.value - AROUND_TOLERANCE);
    filters.ageMax = Math.min(AGE_MAX, draft.age.value + AROUND_TOLERANCE);
  }

  if (draft.gender) filters.gender = draft.gender;
  if (draft.currentLocation) {
    const area = await areas.resolve(draft.currentLocation);
    if ("status" in area) return area;
    applyArea(filters, "current", area);
  }
  if (draft.hometownLocation) {
    const area = await areas.resolve(draft.hometownLocation);
    if ("status" in area) return area;
    applyArea(filters, "hometown", area);
  }
  if (draft.education) filters.education = draft.education;
  if (draft.occupation) filters.occupation = draft.occupation;
  if (draft.incomeRange) filters.incomeRange = draft.incomeRange;
  if (draft.pageSize) filters.pageSize = draft.pageSize;

  return { filters, draft };
}

function applyArea(filters: JsonRecord, prefix: "current" | "hometown", area: ResolvedArea) {
  if (area.level === "PROVINCE") filters[`${prefix}ProvinceCode`] = area.code;
  if (area.level === "CITY") filters[`${prefix}CityCode`] = area.code;
  if (area.level === "DISTRICT") filters[`${prefix}DistrictCode`] = area.code;
}
