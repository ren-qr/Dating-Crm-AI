import { z } from "zod";
import { ApiCode, apiResponse, apiSuccess } from "@/lib/server/api-response";
import { prisma } from "@/lib/server/prisma";
import {
  requireCurrentEmployee,
  requirePermission,
  resolveStoreScope,
  writeAuditLog,
} from "@/lib/server/route-helpers";
import { hashSensitiveValue, normalizePhone } from "@/lib/server/sensitive-fields";
import { createMemberService, findMemberServices, payloadOf } from "@/lib/server/member-service";

const blacklistStatuses = ["ACTIVE", "RESOLVED", "EXPIRED"] as const;
const blacklistSeverities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

const listBlacklistsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  storeId: z.string().trim().min(1).max(80).optional(),
  status: z.enum(blacklistStatuses).optional(),
  severity: z.enum(blacklistSeverities).optional(),
  memberId: z.string().trim().min(1).max(80).optional(),
});

const createBlacklistSchema = z.object({
  storeId: z.string().trim().min(1).max(80).optional(),
  memberId: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().min(5).max(32).optional(),
  idCard: z.string().trim().min(4).max(80).optional(),
  riskType: z.string().trim().max(80).optional(),
  reason: z.string().trim().min(1).max(1000),
  severity: z.enum(blacklistSeverities).default("MEDIUM"),
  expiresAt: z.string().datetime({ offset: true }).optional(),
}).refine((value) => value.memberId || value.phone || value.idCard, {
  message: "memberId, phone or idCard is required",
});

function validationError(request: Request) {
  return apiResponse(request, {
    code: ApiCode.BAD_REQUEST,
    message: "参数错误",
    data: null,
    status: 400,
  });
}

function blacklistToItem(entry: {
  id: string;
  storeId: string;
  memberId: string | null;
  phoneHash: string | null;
  idCardHash: string | null;
  reason: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "ACTIVE" | "RESOLVED" | "EXPIRED";
  createdById: string;
  resolvedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: entry.id,
    storeId: entry.storeId,
    memberId: entry.memberId,
    riskType: entry.severity,
    hasPhoneHash: Boolean(entry.phoneHash),
    hasIdCardHash: Boolean(entry.idCardHash),
    reason: entry.reason,
    severity: entry.severity,
    status: entry.status,
    createdById: entry.createdById,
    resolvedAt: entry.resolvedAt?.toISOString() ?? null,
    expiresAt: entry.expiresAt?.toISOString() ?? null,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

export async function GET(request: Request) {
  const auth = await requireCurrentEmployee(request);

  if (auth instanceof Response) {
    return auth;
  }

  const forbidden = requirePermission(request, auth, "blacklist:read");

  if (forbidden) {
    return forbidden;
  }

  const parsed = listBlacklistsSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );

  if (!parsed.success) {
    return validationError(request);
  }

  const scope = await resolveStoreScope(request, auth, parsed.data.storeId);

  if (scope instanceof Response) {
    return scope;
  }

  if (!(prisma as typeof prisma & { memberService?: unknown }).memberService) {
    const where = { storeId: scope.storeId, ...(parsed.data.status ? { status: parsed.data.status } : {}), ...(parsed.data.severity ? { severity: parsed.data.severity } : {}), ...(parsed.data.memberId ? { memberId: parsed.data.memberId } : {}) };
    const [legacyItems, legacyTotal] = await prisma.$transaction([prisma.blacklistEntry.findMany({ where, orderBy: { createdAt: "desc" }, skip: (parsed.data.page - 1) * parsed.data.pageSize, take: parsed.data.pageSize }), prisma.blacklistEntry.count({ where })]);
    return apiSuccess(request, { items: legacyItems.map(blacklistToItem), page: parsed.data.page, pageSize: parsed.data.pageSize, total: legacyTotal, hasNext: parsed.data.page * parsed.data.pageSize < legacyTotal });
  }

  const services = await findMemberServices(prisma, { storeId: scope.storeId, memberId: parsed.data.memberId, serviceType: "blacklist" });
  const filtered = services.filter((entry) => { const payload = payloadOf(entry.payloadJson); return (!parsed.data.status || entry.status === parsed.data.status) && (!parsed.data.severity || payload.severity === parsed.data.severity); });
  const total = filtered.length;
  const items = filtered.slice((parsed.data.page - 1) * parsed.data.pageSize, parsed.data.page * parsed.data.pageSize).map((entry) => { const payload = payloadOf(entry.payloadJson); return blacklistToItem({ id: entry.id, storeId: entry.storeId, memberId: entry.memberId, phoneHash: typeof payload.phoneHash === "string" ? payload.phoneHash : null, idCardHash: typeof payload.idCardHash === "string" ? payload.idCardHash : null, reason: String(payload.reason ?? ""), severity: (payload.severity as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL") ?? "MEDIUM", status: (entry.status as "ACTIVE" | "RESOLVED" | "EXPIRED") ?? "ACTIVE", createdById: String(payload.createdById ?? entry.operatorId ?? ""), resolvedAt: typeof payload.resolvedAt === "string" ? new Date(payload.resolvedAt) : null, expiresAt: typeof payload.expiresAt === "string" ? new Date(payload.expiresAt) : null, createdAt: entry.createdAt, updatedAt: entry.updatedAt }); });

  return apiSuccess(request, {
    items,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    total,
    hasNext: parsed.data.page * parsed.data.pageSize < total,
  });
}

export async function POST(request: Request) {
  const auth = await requireCurrentEmployee(request);

  if (auth instanceof Response) {
    return auth;
  }

  const forbidden = requirePermission(request, auth, "blacklist:write");

  if (forbidden) {
    return forbidden;
  }

  if (auth.isBootstrapAdmin) {
    return apiResponse(request, {
      code: ApiCode.BAD_REQUEST,
      message: "开发兜底账号不能创建黑名单，请使用真实员工账号",
      data: null,
      status: 400,
    });
  }

  const body = await request.json().catch(() => null);
  const parsed = createBlacklistSchema.safeParse(body);

  if (!parsed.success) {
    return validationError(request);
  }

  const scope = await resolveStoreScope(request, auth, parsed.data.storeId);

  if (scope instanceof Response) {
    return scope;
  }

  if (parsed.data.memberId) {
    const member = await prisma.member.findFirst({
      where: {
        id: parsed.data.memberId,
        storeId: scope.storeId,
      },
      select: { id: true },
    });

    if (!member) {
      return apiResponse(request, {
        code: ApiCode.NOT_FOUND,
        message: "资源不存在",
        data: null,
        status: 404,
      });
    }
  }

  const phoneHash = parsed.data.phone
    ? hashSensitiveValue(normalizePhone(parsed.data.phone))
    : null;
  const idCardHash = parsed.data.idCard
    ? hashSensitiveValue(parsed.data.idCard.trim().toUpperCase())
    : null;

  const created = await prisma.$transaction(async (tx) => {
    const entry = await createMemberService(tx, { storeId: scope.storeId, memberId: parsed.data.memberId, operatorId: auth.employee.employeeId, serviceType: "blacklist", status: "ACTIVE", payloadJson: { phoneHash, idCardHash, reason: parsed.data.reason, severity: parsed.data.severity, createdById: auth.employee.employeeId, expiresAt: parsed.data.expiresAt ?? null } });

    if (parsed.data.memberId) {
      await tx.member.update({
        where: { id: parsed.data.memberId },
        data: {
          status: "BLACKLISTED",
          blacklistedAt: new Date(),
          updatedById: auth.employee.employeeId,
        },
      });
    }

    await writeAuditLog(tx, request, auth, {
      storeId: scope.storeId,
      action: "CREATE",
      resourceType: "BlacklistEntry",
      resourceId: entry.id,
      metadata: {
        memberId: parsed.data.memberId ?? null,
        severity: parsed.data.severity,
        hasPhoneHash: Boolean(phoneHash),
        hasIdCardHash: Boolean(idCardHash),
      },
    });

    return { ...entry, phoneHash, idCardHash, reason: parsed.data.reason, severity: parsed.data.severity, status: "ACTIVE" as const, createdById: auth.employee.employeeId, resolvedAt: null, expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null };
  });

  return apiResponse(request, {
    code: ApiCode.OK,
    message: "创建成功",
    data: blacklistToItem(created),
    status: 201,
  });
}
