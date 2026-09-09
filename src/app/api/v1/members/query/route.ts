import { z } from "zod";
import { executeMemberQuery } from "@/ai-query/execute-member-query";
import { memberQuerySchema } from "@/ai-query/member-query-contract";
import { applicationTrace } from "@/lib/server/query-trace";
import { ApiCode, apiResponse, apiSuccess, getRequestId } from "@/lib/server/api-response";
import { requireCurrentEmployee, requirePermission, resolveStoreScope } from "@/lib/server/route-helpers";

const inputSchema = z.object({
  query: memberQuerySchema,
  page: z.number().int().min(1).max(10000).default(1),
}).strict();

export async function POST(request: Request) {
  const auth = await requireCurrentEmployee(request);
  if (auth instanceof Response) return auth;
  const forbidden = requirePermission(request, auth, "member:read");
  if (forbidden) return forbidden;
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiResponse(request, { code: ApiCode.BAD_REQUEST, message: "会员查询条件格式无效。", data: null, status: 400 });
  }
  const storeScope = await resolveStoreScope(request, auth);
  if (storeScope instanceof Response) return storeScope;

  const traceId = getRequestId(request);
  const ownerEmployeeId = auth.isBootstrapAdmin ? undefined : auth.employee.employeeId;
  applicationTrace.record(traceId, "member_query_authorization", {
    storeScoped: true,
    ownerScoped: Boolean(ownerEmployeeId),
    permission: "member:read",
  });
  const result = await executeMemberQuery(parsed.data.query, {
    storeId: storeScope.storeId,
    ownerEmployeeId,
    traceId,
  }, parsed.data.page);
  if ("status" in result) {
    return apiResponse(request, { code: ApiCode.BAD_REQUEST, message: result.message, data: result.details ?? null, status: 422 });
  }
  return apiSuccess(request, result);
}
