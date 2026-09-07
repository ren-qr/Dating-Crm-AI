import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiCode, apiResponse, apiSuccess } from "@/lib/server/api-response";
import { prisma } from "@/lib/server/prisma";
import {
  requireCurrentEmployee,
  requirePermission,
  resolveStoreScope,
} from "@/lib/server/route-helpers";

const auditActions = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "LOGIN",
  "LOGOUT",
  "EXPORT",
  "IMPORT",
  "ASSIGN",
  "MATCH",
  "CHECK_IN",
  "PAYMENT",
  "BLACKLIST_BLOCK",
  "UPLOAD",
] as const;

const listAuditsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  storeId: z.string().trim().min(1).max(80).optional(),
  actorEmployeeId: z.string().trim().min(1).max(80).optional(),
  action: z.enum(auditActions).optional(),
  resourceType: z.string().trim().min(1).max(120).optional(),
  resourceId: z.string().trim().min(1).max(120).optional(),
  requestId: z.string().trim().min(1).max(120).optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
});

function validationError(request: Request) {
  return apiResponse(request, {
    code: ApiCode.BAD_REQUEST,
    message: "参数错误",
    data: null,
    status: 400,
  });
}

export async function GET(request: Request) {
  const auth = await requireCurrentEmployee(request);

  if (auth instanceof Response) {
    return auth;
  }

  const forbidden = requirePermission(request, auth, "audit:read");

  if (forbidden) {
    return forbidden;
  }

  const parsed = listAuditsSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );

  if (!parsed.success) {
    return validationError(request);
  }

  const scope = await resolveStoreScope(request, auth, parsed.data.storeId);

  if (scope instanceof Response) {
    return scope;
  }

  const where: Prisma.AuditLogWhereInput = {
    storeId: scope.storeId,
    ...(parsed.data.actorEmployeeId ? { actorEmployeeId: parsed.data.actorEmployeeId } : {}),
    ...(parsed.data.action ? { action: parsed.data.action } : {}),
    ...(parsed.data.resourceType ? { resourceType: parsed.data.resourceType } : {}),
    ...(parsed.data.resourceId ? { resourceId: parsed.data.resourceId } : {}),
    ...(parsed.data.requestId ? { requestId: parsed.data.requestId } : {}),
    ...(parsed.data.dateFrom || parsed.data.dateTo
      ? {
          createdAt: {
            ...(parsed.data.dateFrom ? { gte: new Date(parsed.data.dateFrom) } : {}),
            ...(parsed.data.dateTo ? { lte: new Date(parsed.data.dateTo) } : {}),
          },
        }
      : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      include: {
        actorEmployee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (parsed.data.page - 1) * parsed.data.pageSize,
      take: parsed.data.pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return apiSuccess(request, {
    items: items.map((item) => ({
      id: item.id,
      storeId: item.storeId,
      actorEmployeeId: item.actorEmployeeId,
      actorName: item.actorEmployee?.name ?? null,
      actor: item.actorEmployee
        ? {
            id: item.actorEmployee.id,
            name: item.actorEmployee.name,
            email: item.actorEmployee.email,
          }
        : null,
      action: item.action,
      resourceType: item.resourceType,
      resourceId: item.resourceId,
      requestId: item.requestId,
      beforeHash: item.beforeHash,
      afterHash: item.afterHash,
      metadataJson: item.metadataJson,
      ipHash: item.ipHash,
      userAgentHash: item.userAgentHash,
      createdAt: item.createdAt.toISOString(),
    })),
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    total,
    hasNext: parsed.data.page * parsed.data.pageSize < total,
  });
}
