import { z } from "zod";
import { parseMemberQuery, MemberQueryParseError } from "@/ai-query/parse-member-query";
import { completeAiText } from "@/agent-system/shared/ai/client";
import { getAiConfig } from "@/agent-system/shared/ai/config";
import { applicationTrace } from "@/agent-system/tracing/application-trace";
import { ApiCode, apiResponse, apiSuccess, getRequestId } from "@/lib/server/api-response";
import { requireCurrentEmployee, requirePermission } from "@/lib/server/route-helpers";

const inputSchema = z.object({ text: z.string().trim().min(1).max(500) }).strict();

export async function POST(request: Request) {
  const auth = await requireCurrentEmployee(request);
  if (auth instanceof Response) return auth;
  const forbidden = requirePermission(request, auth, "member:read");
  if (forbidden) return forbidden;
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiResponse(request, { code: ApiCode.BAD_REQUEST, message: "参数错误", data: null, status: 400 });
  }

  const traceId = getRequestId(request);
  try {
    const config = await getAiConfig();
    const query = await parseMemberQuery(parsed.data.text, (system, content) => {
      if (!config.configured) throw new MemberQueryParseError("AI 查询解析暂时不可用，请稍后重试。");
      return completeAiText({ messages: [{ role: "system", content: system }, { role: "user", content }] }, config);
    });
    applicationTrace.record(traceId, "member_query_parser", {
      task: query.task,
      filterFields: query.filters.map((filter) => filter.field),
      unresolvedCount: query.unresolved.length,
    });
    return apiSuccess(request, { query });
  } catch (error) {
    const message = error instanceof MemberQueryParseError
      ? error.message
      : "AI 查询解析暂时不可用，请稍后重试。";
    return apiResponse(request, { code: ApiCode.BAD_REQUEST, message, data: null, status: 422 });
  }
}
