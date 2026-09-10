import { normalizePhone } from "@/lib/server/sensitive-fields";
import { memberQuerySchema, type MemberQuery } from "./member-query-contract";
import { MEMBER_QUERY_FIELDS, isMemberQueryableField, memberQueryPromptFieldList } from "./member-query-fields";

const phoneCandidatePattern = /(?<!\d)(?:\+?86[-\s]*)?1(?:[-\s]*\d){10}(?!\d)/u;
const idCardPattern = /(?<![0-9Xx])[1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[0-9Xx](?![0-9Xx])/u;

export class MemberQueryParseError extends Error {
  constructor(message = "AI 未能识别会员查询条件，请换一种明确表述。") {
    super(message);
    this.name = "MemberQueryParseError";
  }
}

export const memberQueryParserPrompt = `你只负责把员工的会员查询自然语言转换为一个 JSON 对象，不查询数据库，不回答问题，不输出 SQL、Prisma、storeId、ownerEmployeeId、employeeId、角色、权限或地区编码。

唯一 JSON 合同：
{"task":"find_member"|"search_members","filters":[{"field":"白名单字段","op":"eq|neq|contains|in|gte|lte|between|around","value":"值"}],"unresolved":[{"text":"未处理原文","reason":"原因"}]}

字段白名单与可用操作符：
${memberQueryPromptFieldList()}

规则：
- 查某个明确姓名、会员编号时 task=find_member；按条件找一批会员时 task=search_members。
- 地区仅输出中文地区名称，由服务器解析。不要输出 Area code。
- 30岁左右使用 age/around/30；30岁以下使用 age/lte/30；175以上使用 heightCm/gte/175；50到60公斤使用 weightKg/between/[50,60]。
- 年龄、身高、体重、资料完整度的 value 必须是 JSON 数字，不能加引号。例如：{"field":"age","op":"eq","value":30}；{"field":"heightCm","op":"gte","value":175}。
- 只有用户明确的条件才进入 filters。条件好、高收入、学历高一点、年轻一点等没有明确业务标准的表达必须放 unresolved，不能自行推断阈值。
- 手机号、身份证号不会发送给你；不要尝试生成或猜测它们。
- 只输出 JSON，不要 Markdown。`;

export async function parseMemberQuery(
  text: string,
  complete: (system: string, content: string) => Promise<string>,
): Promise<MemberQuery> {
  const input = text.trim();
  if (!input) throw new MemberQueryParseError("请输入会员查询条件。");

  const sensitiveQuery = findLocalSensitiveMemberQuery(input);
  if (sensitiveQuery) return sensitiveQuery;

  let raw: string;
  try {
    raw = await complete(memberQueryParserPrompt, input);
  } catch {
    throw new MemberQueryParseError("AI 查询解析暂时不可用，请稍后重试。");
  }

  try {
    return parseMemberQueryValue(JSON.parse(extractJsonObject(raw)));
  } catch {
    throw new MemberQueryParseError();
  }
}

/** Builds an exact Query V2 lookup locally so sensitive identifiers never reach a model. */
export function findLocalSensitiveMemberQuery(text: string): MemberQuery | null {
  const phone = text.match(phoneCandidatePattern)?.[0];
  const normalizedPhone = phone ? normalizePhone(phone).replace(/^\+?86/u, "") : null;
  if (normalizedPhone && /^1[3-9]\d{9}$/u.test(normalizedPhone)) {
    return { task: "find_member", filters: [{ field: "phone", op: "eq", value: normalizedPhone }], unresolved: [] };
  }
  const idCard = text.match(idCardPattern)?.[0];
  if (idCard) {
    return { task: "find_member", filters: [{ field: "idCard", op: "eq", value: idCard.toUpperCase() }], unresolved: [] };
  }
  return null;
}

/** Validates a model-produced value through the single Query V2 contract. */
export function parseMemberQueryValue(value: unknown): MemberQuery {
  const parsed = memberQuerySchema.safeParse(normalizeNumericFilterValues(value));
  if (!parsed.success) throw new MemberQueryParseError();
  return parsed.data;
}

/** Extracts one JSON object from a model response without accepting surrounding prose as data. */
export function extractJsonObject(value: string) {
  const trimmed = value.trim().replace(/^```json\s*/iu, "").replace(/\s*```$/u, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("No JSON object");
  return trimmed.slice(start, end + 1);
}

/**
 * Some providers serialize numeric JSON values as strings despite the contract.
 * Only allowlisted numeric query fields are normalized; every other shape still
 * reaches the strict schema unchanged and is rejected when invalid.
 */
function normalizeNumericFilterValues(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.filters)) return value;
  return {
    ...value,
    filters: value.filters.map((filter) => {
      if (!isRecord(filter) || typeof filter.field !== "string" || !isMemberQueryableField(filter.field)) {
        return filter;
      }
      if (MEMBER_QUERY_FIELDS[filter.field].type !== "number") return filter;
      return { ...filter, value: normalizeNumericValue(filter.value) };
    }),
  };
}

function normalizeNumericValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeNumericValue);
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return /^-?\d+(?:\.\d+)?$/u.test(trimmed) ? Number(trimmed) : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
