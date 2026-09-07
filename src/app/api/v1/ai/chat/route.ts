import { z } from "zod";
import { runBackofficeTurn } from "@/agent-system/runtime/bootstrap";
import { StateAccessError, StateBusyError } from "@/agent-system/state/state-store";
import { ApiCode, apiResponse, apiSuccess, getRequestId } from "@/lib/server/api-response";
import { requireCurrentEmployee } from "@/lib/server/route-helpers";

const chatSchema = z
  .object({
    conversationId: z.string().uuid().optional(),
    message: z.string().trim().min(1).max(2000),
    clarificationId: z.string().uuid().optional(),
    clarificationAnswer: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export async function POST(request: Request) {
  const traceId = getRequestId(request);
  const headers = new Headers(request.headers);
  headers.set("x-request-id", traceId);
  const responseRequest = new Request(request.url, { headers });
  const auth = await requireCurrentEmployee(responseRequest);

  if (auth instanceof Response) {
    return auth;
  }

  const body = await request.json().catch(() => null);
  const parsed = chatSchema.safeParse(body);

  if (!parsed.success) {
    return apiResponse(responseRequest, {
      code: ApiCode.BAD_REQUEST,
      message: "参数错误",
      data: null,
      status: 400,
    });
  }

  try {
    const result = await runBackofficeTurn(parsed.data, auth, traceId);

    return apiSuccess(responseRequest, {
      conversationId: result.conversationId,
      status: result.status,
      traceId: result.traceId,
      message: {
        role: "assistant",
        content: result.text,
      },
      state: result.state,
      displayResult: result.displayResult,
      clarification: result.clarification,
    });
  } catch (error) {
    const denied = error instanceof StateAccessError;
    const busy = error instanceof StateBusyError;
    return apiResponse(responseRequest, {
      code: denied ? ApiCode.FORBIDDEN : busy ? ApiCode.CONFLICT : ApiCode.INTERNAL_ERROR,
      message: denied || busy ? error.message : "AI 助理暂时不可用",
      data: null,
      status: denied ? 403 : busy ? 409 : 502,
    });
  }
}
