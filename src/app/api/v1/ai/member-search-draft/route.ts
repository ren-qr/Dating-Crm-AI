import { z } from "zod";
import { parseMemberSearchDraft, MemberSearchDraftParseError } from "@/agent-system/query-workbench/member-search-parser";
import { completeAiText } from "@/agent-system/shared/ai/client";
import { getAiConfig } from "@/agent-system/shared/ai/config";
import { assertSafeModelText } from "@/agent-system/shared/ai/privacy";
import { ApiCode, apiResponse, apiSuccess } from "@/lib/server/api-response";
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

  try {
    assertSafeModelText(parsed.data.text, "快速填写输入");
    const config = await getAiConfig();
    if (!config.configured) {
      return apiResponse(request, { code: ApiCode.INTERNAL_ERROR, message: "AI 快速填写暂时不可用，请手动填写筛选条件。", data: null, status: 503 });
    }
    const draft = await parseMemberSearchDraft(
      parsed.data.text,
      (system, content) => completeAiText({ messages: [{ role: "system", content: system }, { role: "user", content }] }, config),
    );
    return apiSuccess(request, { draft });
  } catch (error) {
    const message = error instanceof MemberSearchDraftParseError
      ? error.message
      : "AI 快速填写暂时不可用，请手动填写筛选条件。";
    return apiResponse(request, { code: ApiCode.BAD_REQUEST, message, data: null, status: 422 });
  }
}
