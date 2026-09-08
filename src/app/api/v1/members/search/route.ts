import { z } from "zod";
import { executeMemberSearchDraft } from "@/agent-system/query-workbench/member-search-execution";
import { memberSearchDraftSchema } from "@/agent-system/query-workbench/member-search-draft";
import { ApiCode, apiResponse, apiSuccess, getRequestId } from "@/lib/server/api-response";
import { requireCurrentEmployee, requirePermission, resolveStoreScope } from "@/lib/server/route-helpers";

const inputSchema = z.object({
  draft: memberSearchDraftSchema,
  page: z.number().int().min(1).max(10000).default(1),
}).strict();

export async function POST(request: Request) {
  const auth = await requireCurrentEmployee(request);
  if (auth instanceof Response) return auth;
  const forbidden = requirePermission(request, auth, "member:read");
  if (forbidden) return forbidden;
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiResponse(request, { code: ApiCode.BAD_REQUEST, message: "筛选条件格式无效。", data: null, status: 400 });
  }
  const scope = await resolveStoreScope(request, auth);
  if (scope instanceof Response) return scope;

  const traceId = getRequestId(request);
  const result = await executeMemberSearchDraft(parsed.data.draft, parsed.data.page, {
    auth: { ...auth, employeeStoreId: scope.storeId },
    operatorId: auth.employee.employeeId,
    storeId: scope.storeId,
    sessionId: `workbench-${traceId}`,
    traceId,
    trustZone: "local",
  });
  if ("status" in result) {
    return apiResponse(request, { code: ApiCode.BAD_REQUEST, message: result.message, data: null, status: 400 });
  }
  return apiSuccess(request, result);
}
