import { apiSuccess } from "@/lib/server/api-response";
import { prisma } from "@/lib/server/prisma";
import { payloadOf } from "@/lib/server/member-service";
import {
  requireCurrentEmployee,
  requirePermission,
  resolveStoreScope,
} from "@/lib/server/route-helpers";

const RECENT_AUDIT_LIMIT = 8;

function getTodayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start, end };
}

export async function GET(request: Request) {
  const auth = await requireCurrentEmployee(request);

  if (auth instanceof Response) {
    return auth;
  }

  const forbidden = requirePermission(request, auth, "member:read");

  if (forbidden) {
    return forbidden;
  }

  const scope = await resolveStoreScope(request, auth);

  if (scope instanceof Response) {
    return scope;
  }

  const { start, end } = getTodayRange();
  const legacyDashboard = !(prisma as typeof prisma & { memberService?: unknown }).memberService;
  const [
    memberTotal,
    newMembersToday,
    profileIncomplete,
    followupResult,
    blacklistResult,
    recentAudits,
  ] = await prisma.$transaction([
    prisma.member.count({ where: { storeId: scope.storeId } }),
    prisma.member.count({
      where: { storeId: scope.storeId, createdAt: { gte: start, lt: end } },
    }),
    prisma.member.count({
      where: {
        storeId: scope.storeId,
        profileCompletenessPercent: { lt: 100 },
      },
    }),
    legacyDashboard ? prisma.followUpRecord.count({ where: { storeId: scope.storeId, nextAt: { gte: start, lt: end } } }) : prisma.memberService.findMany({ where: { storeId: scope.storeId, serviceType: { in: ["followup", "blacklist"] } }, select: { serviceType: true, status: true, payloadJson: true } }),
    legacyDashboard ? prisma.blacklistEntry.count({ where: { storeId: scope.storeId, status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: start } }] } }) : prisma.memberService.findMany({ where: { storeId: scope.storeId, serviceType: { in: ["followup", "blacklist"] } }, select: { serviceType: true, status: true, payloadJson: true } }),
    prisma.auditLog.findMany({
      where: { storeId: scope.storeId },
      select: {
        id: true,
        action: true,
        resourceType: true,
        createdAt: true,
        actorEmployee: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: RECENT_AUDIT_LIMIT,
    }),
  ]);
  const serviceRecords = legacyDashboard ? [] : [...(followupResult as Array<{ serviceType: string; status: string | null; payloadJson: import("@prisma/client").Prisma.JsonValue }>), ...(blacklistResult as Array<{ serviceType: string; status: string | null; payloadJson: import("@prisma/client").Prisma.JsonValue }>)];
  const followupsDueToday = legacyDashboard ? Number(followupResult) : serviceRecords.filter((item) => item.serviceType === "followup" && typeof payloadOf(item.payloadJson).nextAt === "string" && new Date(String(payloadOf(item.payloadJson).nextAt)) >= start && new Date(String(payloadOf(item.payloadJson).nextAt)) < end).length;
  const activeBlacklistCount = legacyDashboard ? Number(blacklistResult) : serviceRecords.filter((item) => item.serviceType === "blacklist" && item.status === "ACTIVE" && (!payloadOf(item.payloadJson).expiresAt || new Date(String(payloadOf(item.payloadJson).expiresAt)) > start)).length;

  const typedAudits = recentAudits as Array<{ id: string; action: string; resourceType: string; createdAt: Date; actorEmployee: { name: string } | null }>;
  return apiSuccess(request, {
    memberTotal,
    newMembersToday,
    followupsDueToday,
    profileIncomplete,
    activeBlacklistCount,
    recentAudits: typedAudits.map((audit) => ({
      id: audit.id,
      action: audit.action,
      resourceType: audit.resourceType,
      createdAt: audit.createdAt.toISOString(),
      actorName: audit.actorEmployee?.name ?? null,
    })),
  });
}
