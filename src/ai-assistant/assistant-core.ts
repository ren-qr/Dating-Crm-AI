import { z } from "zod";
import {
  extractJsonObject,
  findLocalSensitiveMemberQuery,
  parseMemberQueryValue,
} from "@/ai-query/parse-member-query";
import type { MemberQuery } from "@/ai-query/member-query-contract";
import { memberQueryPromptFieldList } from "@/ai-query/member-query-fields";
import { redactSensitiveText } from "@/lib/server/ai/privacy";

export type AssistantMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AssistantAction =
  | { type: "reply"; content: string }
  | { type: "query_members"; query: MemberQuery };

export class AssistantActionParseError extends Error {
  constructor(message = "AI 助理未能生成有效回复，请重试。") {
    super(message);
    this.name = "AssistantActionParseError";
  }
}

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("reply"), content: z.string().trim().min(1).max(4_000) }).strict(),
  z.object({ type: z.literal("query_members"), query: z.unknown() }).strict(),
]);

const assistantPrompt = `你是 Meetra 门店后台的 AI 助理。每次只输出一个 JSON 对象，不能输出 Markdown、解释、SQL、Prisma、storeId、ownerEmployeeId、员工、角色或权限。

唯一动作合同：
{"type":"reply","content":"普通回复"}
或
{"type":"query_members","query":{"task":"find_member"|"search_members","filters":[{"field":"白名单字段","op":"eq|neq|contains|in|gte|lte|between|around","value":"值"}],"unresolved":[{"text":"未处理原文","reason":"原因"}]}}

当员工明确要查找、筛选、查询会员时，使用 query_members；query 必须只使用以下 Query V2 白名单字段与操作符：
${memberQueryPromptFieldList()}

Query V2 规则：地区只输出中文名称；年龄、身高、体重、资料完整度使用 JSON 数字而不是字符串；30岁左右为 age/around/30；30岁以下为 age/lte/30；没有明确业务标准的“条件不错、收入高、学历高一点、年轻一点”等表达必须写入 unresolved，不能虚构阈值。

其他问题使用 reply 正常回答。当前你可以普通对话，也可以协助按自然语言查询会员；没有 Web Search、RAG 或其他业务工具。`;

/**
 * The minimal Assistant Core: it either produces a normal reply or a Query V2
 * action. It never receives server-owned scope or database access.
 */
export async function runAssistantCore(
  messages: AssistantMessage[],
  complete: (system: string, messages: AssistantMessage[]) => Promise<string>,
): Promise<AssistantAction> {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
  if (!latestUserMessage) throw new AssistantActionParseError("请先发送一条消息。");

  const localSensitiveQuery = findLocalSensitiveMemberQuery(latestUserMessage.content);
  if (localSensitiveQuery) return { type: "query_members", query: localSensitiveQuery };

  const safeMessages = messages.map((message) => ({
    ...message,
    content: redactSensitiveText(message.content),
  }));
  const raw = await complete(assistantPrompt, safeMessages);
  return parseAssistantAction(raw);
}

function parseAssistantAction(raw: string): AssistantAction {
  try {
    const parsed = actionSchema.safeParse(JSON.parse(extractJsonObject(raw)));
    if (!parsed.success) throw new Error("Invalid action");
    if (parsed.data.type === "reply") return parsed.data;
    return { type: "query_members", query: parseMemberQueryValue(parsed.data.query) };
  } catch (error) {
    if (error instanceof AssistantActionParseError) throw error;
    throw new AssistantActionParseError();
  }
}
