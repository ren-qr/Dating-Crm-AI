import { apiSuccess } from "@/lib/server/api-response";
import { prisma } from "@/lib/server/prisma";
import { requireCurrentEmployee, requirePermission, resolveStoreScope } from "@/lib/server/route-helpers";

export async function GET(request: Request) {
  const auth = await requireCurrentEmployee(request);
  if (auth instanceof Response) return auth;
  const forbidden = requirePermission(request, auth, "member:read");
  if (forbidden) return forbidden;
  const scope = await resolveStoreScope(request, auth);
  if (scope instanceof Response) return scope;
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const ownerScope = auth.isBootstrapAdmin ? {} : { ownerEmployeeId: auth.employee.employeeId };
  const [memberTotal, newMembersToday, profileIncomplete, activeBlacklistCount, followupsDueToday, audits] = await Promise.all([
    prisma.member.count({ where: { storeId: scope.storeId, ...ownerScope } }),
    prisma.member.count({ where: { storeId: scope.storeId, ...ownerScope, createdAt: { gte: start } } }),
    prisma.member.count({ where: { storeId: scope.storeId, ...ownerScope, profileCompletenessPercent: { lt: 100 } } }),
    prisma.blacklistEntry.count({ where: { storeId: scope.storeId, status: "ACTIVE" } }),
    prisma.followUpRecord.count({ where: { storeId: scope.storeId, employeeId: auth.employee.employeeId, nextAt: { gte: start, lt: new Date(start.getTime() + 86_400_000) } } }),
    prisma.auditLog.findMany({ where: { storeId: scope.storeId }, include: { actorEmployee: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);
  return apiSuccess(request, { memberTotal, newMembersToday, followupsDueToday, profileIncomplete, activeBlacklistCount, recentAudits: audits.map((item) => ({ id: item.id, action: item.action, resourceType: item.resourceType, createdAt: item.createdAt.toISOString(), actorName: item.actorEmployee?.name ?? null })) });
}
