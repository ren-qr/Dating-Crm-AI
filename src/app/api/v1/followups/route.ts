import { z } from "zod";
import { ApiCode, apiResponse } from "@/lib/server/api-response";
import { findActiveBlacklistBlock } from "@/lib/server/blacklist";
import { prisma } from "@/lib/server/prisma";
import { requireCurrentEmployee, requirePermission, resolveStoreScope, writeAuditLog } from "@/lib/server/route-helpers";

const types = ["CALL", "WECHAT", "VISIT", "DATE_FEEDBACK", "COMPLAINT", "RETURN_VISIT", "OTHER"] as const;
const createSchema = z.object({ storeId: z.string().trim().min(1).max(80).optional(), memberId: z.string().trim().min(1).max(80), matchId: z.string().trim().min(1).max(80).optional(), type: z.enum(types).optional(), method: z.string().trim().min(1).max(40).optional(), content: z.string().trim().min(1).max(2000), nextAction: z.string().trim().max(240).optional(), nextAt: z.string().datetime({ offset: true }).optional(), nextFollowUpAt: z.string().datetime({ offset: true }).optional() }).refine((value) => value.type || value.method, { message: "type or method is required" });
function normalizeType(value: string | undefined): (typeof types)[number] { return value === "PHONE" ? "CALL" : types.find((type) => type === value) ?? "OTHER"; }

export async function POST(request: Request) {
  const auth = await requireCurrentEmployee(request); if (auth instanceof Response) return auth;
  const forbidden = requirePermission(request, auth, "followup:write"); if (forbidden) return forbidden;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiResponse(request, { code: ApiCode.BAD_REQUEST, message: "参数错误", data: null, status: 400 });
  const scope = await resolveStoreScope(request, auth, parsed.data.storeId); if (scope instanceof Response) return scope;
  const member = await prisma.member.findFirst({ where: { id: parsed.data.memberId, storeId: scope.storeId, ...(auth.isBootstrapAdmin ? {} : { ownerEmployeeId: auth.employee.employeeId }) }, select: { id: true } });
  if (!member) return apiResponse(request, { code: ApiCode.NOT_FOUND, message: "资源不存在", data: null, status: 404 });
  if (parsed.data.matchId) {
    const match = await prisma.matchRecord.findFirst({ where: { id: parsed.data.matchId, storeId: scope.storeId, OR: [{ initiatorMemberId: member.id }, { candidateMemberId: member.id }] }, select: { id: true } });
    if (!match) return apiResponse(request, { code: ApiCode.BAD_REQUEST, message: "匹配记录不存在或不属于该会员", data: null, status: 400 });
  }
  const blocked = await findActiveBlacklistBlock(prisma, { storeId: scope.storeId, memberId: member.id });
  if (blocked) return apiResponse(request, { code: ApiCode.BLACKLIST_BLOCKED, message: "黑名单拦截", data: { blacklistEntryId: blocked.id, severity: blocked.severity }, status: 409 });
  const record = await prisma.$transaction(async (tx) => {
    const created = await tx.followUpRecord.create({ data: { storeId: scope.storeId, memberId: member.id, matchId: parsed.data.matchId ?? null, employeeId: auth.employee.employeeId, type: normalizeType(parsed.data.type ?? parsed.data.method), content: parsed.data.content, nextAction: parsed.data.nextAction ?? null, nextAt: parsed.data.nextAt ? new Date(parsed.data.nextAt) : parsed.data.nextFollowUpAt ? new Date(parsed.data.nextFollowUpAt) : null }, include: { employee: { select: { name: true } } } });
    await writeAuditLog(tx, request, auth, { storeId: scope.storeId, action: "CREATE", resourceType: "FollowUpRecord", resourceId: created.id, metadata: { memberId: member.id, type: created.type, hasNextAt: Boolean(created.nextAt) } });
    return created;
  });
  return apiResponse(request, { code: ApiCode.OK, message: "创建成功", data: { id: record.id, memberId: record.memberId, method: record.type, content: record.content, nextAction: record.nextAction, nextFollowUpAt: record.nextAt?.toISOString() ?? null, actorName: record.employee?.name ?? null, createdAt: record.createdAt.toISOString() }, status: 201 });
}
