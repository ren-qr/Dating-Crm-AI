import { z } from "zod";
import { ApiCode, apiResponse, apiSuccess } from "@/lib/server/api-response";
import { prisma } from "@/lib/server/prisma";
import { requireCurrentEmployee, requirePermission, resolveStoreScope, writeAuditLog } from "@/lib/server/route-helpers";
import { hashSensitiveValue, normalizePhone } from "@/lib/server/sensitive-fields";

const statuses = ["ACTIVE", "RESOLVED", "EXPIRED"] as const;
const severities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const listSchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), status: z.enum(statuses).optional(), severity: z.enum(severities).optional(), memberId: z.string().trim().min(1).max(80).optional() });
const createSchema = z.object({ storeId: z.string().trim().min(1).max(80).optional(), memberId: z.string().trim().min(1).max(80).optional(), phone: z.string().trim().min(5).max(32).optional(), idCard: z.string().trim().min(4).max(80).optional(), reason: z.string().trim().min(1).max(1000), severity: z.enum(severities).default("MEDIUM"), expiresAt: z.string().datetime({ offset: true }).optional() }).refine((value) => value.memberId || value.phone || value.idCard, { message: "memberId, phone or idCard is required" });

function validationError(request: Request) { return apiResponse(request, { code: ApiCode.BAD_REQUEST, message: "参数错误", data: null, status: 400 }); }
function item(entry: { id: string; storeId: string; memberId: string | null; phoneHash: string | null; idCardHash: string | null; reason: string; severity: (typeof severities)[number]; status: (typeof statuses)[number]; createdById: string; resolvedAt: Date | null; expiresAt: Date | null; createdAt: Date; updatedAt: Date }) {
  return { id: entry.id, storeId: entry.storeId, memberId: entry.memberId, riskType: entry.severity, hasPhoneHash: Boolean(entry.phoneHash), hasIdCardHash: Boolean(entry.idCardHash), reason: entry.reason, severity: entry.severity, status: entry.status, createdById: entry.createdById, resolvedAt: entry.resolvedAt?.toISOString() ?? null, expiresAt: entry.expiresAt?.toISOString() ?? null, createdAt: entry.createdAt.toISOString(), updatedAt: entry.updatedAt.toISOString() };
}

export async function GET(request: Request) {
  const auth = await requireCurrentEmployee(request); if (auth instanceof Response) return auth;
  const forbidden = requirePermission(request, auth, "blacklist:read"); if (forbidden) return forbidden;
  const parsed = listSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams)); if (!parsed.success) return validationError(request);
  const scope = await resolveStoreScope(request, auth); if (scope instanceof Response) return scope;
  const where = { storeId: scope.storeId, ...(parsed.data.status ? { status: parsed.data.status } : {}), ...(parsed.data.severity ? { severity: parsed.data.severity } : {}), ...(parsed.data.memberId ? { memberId: parsed.data.memberId } : {}) };
  const [entries, total] = await Promise.all([prisma.blacklistEntry.findMany({ where, orderBy: { createdAt: "desc" }, skip: (parsed.data.page - 1) * parsed.data.pageSize, take: parsed.data.pageSize }), prisma.blacklistEntry.count({ where })]);
  return apiSuccess(request, { items: entries.map(item), page: parsed.data.page, pageSize: parsed.data.pageSize, total, hasNext: parsed.data.page * parsed.data.pageSize < total });
}

export async function POST(request: Request) {
  const auth = await requireCurrentEmployee(request); if (auth instanceof Response) return auth;
  const forbidden = requirePermission(request, auth, "blacklist:write"); if (forbidden) return forbidden;
  if (auth.isBootstrapAdmin) return apiResponse(request, { code: ApiCode.BAD_REQUEST, message: "开发兜底账号不能创建黑名单，请使用真实员工账号", data: null, status: 400 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return validationError(request);
  const scope = await resolveStoreScope(request, auth, parsed.data.storeId); if (scope instanceof Response) return scope;
  if (parsed.data.memberId) {
    const member = await prisma.member.findFirst({ where: { id: parsed.data.memberId, storeId: scope.storeId, ownerEmployeeId: auth.employee.employeeId }, select: { id: true } });
    if (!member) return apiResponse(request, { code: ApiCode.NOT_FOUND, message: "资源不存在", data: null, status: 404 });
  }
  const phoneHash = parsed.data.phone ? hashSensitiveValue(normalizePhone(parsed.data.phone)) : null;
  const idCardHash = parsed.data.idCard ? hashSensitiveValue(parsed.data.idCard.trim().toUpperCase()) : null;
  const created = await prisma.$transaction(async (tx) => {
    const entry = await tx.blacklistEntry.create({ data: { storeId: scope.storeId, memberId: parsed.data.memberId ?? null, phoneHash, idCardHash, reason: parsed.data.reason, severity: parsed.data.severity, createdById: auth.employee.employeeId, expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null } });
    if (parsed.data.memberId) await tx.member.update({ where: { id: parsed.data.memberId }, data: { status: "BLACKLISTED", updatedById: auth.employee.employeeId } });
    await writeAuditLog(tx, request, auth, { storeId: scope.storeId, action: "CREATE", resourceType: "BlacklistEntry", resourceId: entry.id, metadata: { memberId: entry.memberId, severity: entry.severity, hasPhoneHash: Boolean(phoneHash), hasIdCardHash: Boolean(idCardHash) } });
    return entry;
  });
  return apiResponse(request, { code: ApiCode.OK, message: "创建成功", data: item(created), status: 201 });
}
