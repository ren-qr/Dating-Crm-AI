import type { CapabilityRequest } from "../contracts/capability-request";
import type { JsonRecord } from "../contracts/common-types";
import type { GatewayStop } from "../contracts/gateway-result";
import type { WorkingState } from "../state/working-state";
import { AreaResolver, type ResolvedArea } from "./area-resolver";

const AGE_MIN = 18;
const AGE_MAX = 100;
const AROUND_TOLERANCE = 2;
const YOUNGER_STEP = 2;

export async function resolveSearchSemantics(
  request: CapabilityRequest,
  state: WorkingState,
  areas: AreaResolver,
): Promise<{ args: JsonRecord } | GatewayStop> {
  const base = request.requestMode === "refine_query" || request.requestMode === "paginate_query"
    ? state.activeQuery?.resolvedFilters
    : null;
  if ((request.requestMode === "refine_query" || request.requestMode === "paginate_query") && !base) {
    return clarify("activeQuery", "no_active_query", "请先执行一次会员查询，再继续调整条件。");
  }
  const args: JsonRecord = { ...(base ?? {}) };
  if (request.requestMode === "paginate_query") {
    args.page = Number(args.page ?? 1) + 1;
    return { args };
  }

  for (const [key, argument] of Object.entries(request.args)) {
    if (argument.kind === "reference") {
      return clarify(key, "reference_not_supported_for_search", "请说明要调整的具体筛选条件。");
    }
    if (key === "gender") {
      const gender = normalizeGender(argument.value);
      if (!gender) return clarificationForInvalid(key, "性别请明确为男、女或系统支持的性别值。");
      args.gender = gender;
      continue;
    }
    if (key === "age") {
      const age = numberValue(argument.value);
      if (argument.kind === "exact" && age !== null) {
        args.ageMin = age;
        args.ageMax = age;
        continue;
      }
      // `operator` is the Manager's canonical protocol value. `concept` preserves
      // the user's words for tracing only; treating it as an operator lets model
      // prose silently become executable semantics.
      const operation = argument.operator;
      if (operation === "around" && age !== null) {
        args.ageMin = Math.max(AGE_MIN, age - AROUND_TOLERANCE);
        args.ageMax = Math.min(AGE_MAX, age + AROUND_TOLERANCE);
        continue;
      }
      if (operation === "younger" || operation === "not_too_old") {
        const currentMin = numberValue(args.ageMin);
        const currentMax = numberValue(args.ageMax);
        if (currentMin === null || currentMax === null) {
          return clarify("age", "age_context_required", "请说明具体年龄范围，或先执行一次带年龄条件的查询。");
        }
        args.ageMin = Math.max(AGE_MIN, currentMin - YOUNGER_STEP);
        args.ageMax = Math.max(AGE_MIN, currentMax - YOUNGER_STEP);
        continue;
      }
      return clarify("age", "unsupported_age_semantic", "请说明具体年龄或年龄范围。");
    }
    if (key === "ageMin" || key === "ageMax") {
      const age = numberValue(argument.value);
      if (argument.kind !== "exact" || age === null) return clarificationForInvalid(key, "年龄范围需要使用具体整数。");
      args[key] = age;
      continue;
    }
    if (key === "currentLocation" || key === "hometownLocation") {
      const location = stringValue(argument.value);
      if (!location) return clarificationForInvalid(key, "请说明具体地区名称。");
      const resolved = await areas.resolve(location);
      if ("status" in resolved) return resolved;
      applyArea(args, key === "currentLocation" ? "current" : "hometown", resolved);
      continue;
    }
    if (key === "education") {
      if (argument.kind !== "exact" || !stringValue(argument.value)) {
        return clarify("education", "no_business_ordering_defined", "你希望学历具体筛到哪一档？");
      }
      args.education = stringValue(argument.value)!;
      continue;
    }
    if (key === "incomeRange") {
      if (argument.kind !== "exact" || !stringValue(argument.value)) {
        return clarify("incomeRange", "no_income_parser_defined", "请说明现有的具体收入范围类别，暂不支持数值收入筛选。");
      }
      args.incomeRange = stringValue(argument.value)!;
      continue;
    }
    if (key === "occupation") {
      if (argument.kind !== "exact" || !stringValue(argument.value)) return clarificationForInvalid(key, "请说明具体职业。");
      args.occupation = stringValue(argument.value)!;
      continue;
    }
    if (key === "pageSize") {
      const pageSize = numberValue(argument.value);
      if (argument.kind !== "exact" || pageSize === null) return clarificationForInvalid(key, "请说明需要的结果数量。");
      if (pageSize < 1 || pageSize > 50) return { status: "ValidationError", message: "每页数量必须在 1 到 50 之间。" };
      args.pageSize = pageSize;
      continue;
    }
    if (key === "page") {
      const page = numberValue(argument.value);
      if (argument.kind !== "exact" || page === null) return clarificationForInvalid(key, "页码需要为正整数。");
      args.page = page;
      continue;
    }
    return { status: "ValidationError", message: "请求包含未支持的搜索条件。" };
  }

  if (numberValue(args.ageMin) !== null && numberValue(args.ageMax) !== null && Number(args.ageMin) > Number(args.ageMax)) {
    return { status: "ValidationError", message: "年龄范围无效。" };
  }
  return { args };
}

function applyArea(args: JsonRecord, prefix: "current" | "hometown", area: ResolvedArea) {
  delete args[`${prefix}ProvinceCode`];
  delete args[`${prefix}CityCode`];
  delete args[`${prefix}DistrictCode`];
  if (area.level === "PROVINCE") args[`${prefix}ProvinceCode`] = area.code;
  if (area.level === "CITY") args[`${prefix}CityCode`] = area.code;
  if (area.level === "DISTRICT") args[`${prefix}DistrictCode`] = area.code;
}
function normalizeGender(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : value;
  const map: Record<string, string> = { 男: "MALE", 男性: "MALE", 女: "FEMALE", 女性: "FEMALE" };
  const result = typeof normalized === "string" ? map[normalized] ?? normalized : null;
  return result && ["MALE", "FEMALE", "OTHER", "UNKNOWN"].includes(result) ? result : null;
}
function numberValue(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}
function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function clarificationForInvalid(field: string, message: string): GatewayStop {
  return { status: "ValidationError", message, clarification: { field, reason: "invalid_exact_value", question: message, options: [] } };
}
function clarify(field: string, reason: string, question: string): GatewayStop {
  return { status: "ClarificationRequired", message: question, clarification: { field, reason, question, options: [] } };
}
