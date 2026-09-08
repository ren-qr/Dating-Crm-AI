import { memberSearchDraftSchema, type MemberSearchDraft } from "./member-search-draft";

export class MemberSearchDraftParseError extends Error {
  constructor(message = "AI 未能识别筛选条件，请手动填写。") {
    super(message);
    this.name = "MemberSearchDraftParseError";
  }
}

export const memberSearchParserPrompt = `你是会员查询的快捷填表器。只把用户明确表达的条件转换成 JSON，不查询会员，不回答业务问题，不生成地区编码、门店、员工、权限或任何身份字段。\n\n只允许输出这个 JSON 对象：age（exact/bounds/around）、gender（MALE/FEMALE/OTHER/UNKNOWN）、currentLocation、hometownLocation、education、occupation、incomeRange、pageSize、unresolved。年龄：以下/不超过= bounds.max，以上/至少= bounds.min，范围= bounds.min/max，左右= around。无法确定的词写入 unresolved。只输出 JSON。`;

export async function parseMemberSearchDraft(
  text: string,
  complete: (system: string, content: string) => Promise<string>,
): Promise<MemberSearchDraft> {
  if (!text.trim()) throw new MemberSearchDraftParseError("请输入需要识别的筛选条件。");

  let raw: string;
  try {
    raw = await complete(memberSearchParserPrompt, text.trim());
  } catch {
    throw new MemberSearchDraftParseError("AI 快速填写暂时不可用，请手动填写筛选条件。");
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(extractJson(raw));
  } catch {
    throw new MemberSearchDraftParseError();
  }
  const parsed = memberSearchDraftSchema.safeParse(candidate);
  if (!parsed.success || hasAreaCode(parsed.data)) {
    throw new MemberSearchDraftParseError();
  }
  return parsed.data;
}

function extractJson(value: string) {
  const trimmed = value.trim().replace(/^```json\s*/iu, "").replace(/\s*```$/u, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("No JSON object");
  return trimmed.slice(start, end + 1);
}

function hasAreaCode(draft: MemberSearchDraft) {
  return [draft.currentLocation, draft.hometownLocation].some((value) => /^\d{2}(?:\d{2}(?:\d{2})?)?$/u.test(value ?? ""));
}
