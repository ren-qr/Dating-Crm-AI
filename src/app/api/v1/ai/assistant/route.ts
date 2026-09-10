import { z } from "zod";
import { runAssistantCore } from "@/ai-assistant/assistant-core";
import { executeMemberQuery } from "@/ai-query/execute-member-query";
import { completeAiText } from "@/lib/server/ai/client";
import { getAiConfig } from "@/lib/server/ai/config";
import { ApiCode, apiResponse, apiSuccess, getRequestId } from "@/lib/server/api-response";
import { applicationTrace } from "@/lib/server/query-trace";
import { requireCurrentEmployee, requirePermission, resolveStoreScope } from "@/lib/server/route-helpers";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(2_000),
}).strict();

const inputSchema = z.object({
  messages: z.array(messageSchema).min(1).max(12),
}).strict().superRefine((input, context) => {
  if (input.messages.at(-1)?.role !== "user") {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "最后一条消息必须来自用户" });
  }
});

export async function POST(request: Request) {
  const auth = await requireCurrentEmployee(request);
  if (auth instanceof Response) return auth;
  const forbidden = requirePermission(request, auth, "member:read");
  if (forbidden) return forbidden;
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiResponse(request, { code: ApiCode.BAD_REQUEST, message: "对话参数错误", data: null, status: 400 });
  }

  const traceId = getRequestId(request);
  try {
    const config = await getAiConfig();
    const action = await runAssistantCore(parsed.data.messages.slice(-12), (system, messages) => {
      if (!config.configured) throw new Error("AI 模型尚未配置");
      return completeAiText({ messages: [{ role: "system", content: system }, ...messages] }, config);
    });
    applicationTrace.record(traceId, "assistant_action", { type: action.type });

    if (action.type === "reply") {
      return apiSuccess(request, { action: { type: "reply" as const }, content: action.content });
    }

    if (action.query.unresolved.length > 0) {
      return apiSuccess(request, {
        action,
        content: "有未明确的查询条件，请先补充或调整后再查询。",
      });
    }

    const storeScope = await resolveStoreScope(request, auth);
    if (storeScope instanceof Response) return storeScope;
    const result = await executeMemberQuery(action.query, {
      storeId: storeScope.storeId,
      ownerEmployeeId: auth.isBootstrapAdmin ? undefined : auth.employee.employeeId,
      traceId,
    });
    if ("status" in result) {
      return apiSuccess(request, { action, content: result.message, stop: result });
    }
    return apiSuccess(request, {
      action,
      content: `找到 ${result.total} 位符合条件的会员。`,
      result,
    });
  } catch {
    return apiResponse(request, { code: ApiCode.BAD_REQUEST, message: "AI 助理暂时不可用，请稍后重试。", data: null, status: 422 });
  }
}
