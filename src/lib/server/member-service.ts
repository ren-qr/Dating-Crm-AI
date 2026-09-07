import type { Prisma } from "@prisma/client";

export type ServicePayload = Record<string, unknown>;

export function payloadOf(value: Prisma.JsonValue): ServicePayload {
  return value && typeof value === "object" && !Array.isArray(value) ? value as ServicePayload : {};
}

export async function findMemberServices(
  tx: Pick<Prisma.TransactionClient, "memberService"> | typeof import("@/lib/server/prisma").prisma,
  input: { storeId: string; memberId?: string; serviceType?: string },
) {
  const client = (tx as unknown as { memberService?: typeof tx.memberService }).memberService;
  if (!client) {
    const legacy = tx as unknown as Record<string, { findMany: (args: unknown) => Promise<unknown[]> }>;
    const table = input.serviceType === "blacklist" ? legacy.blacklistEntry : input.serviceType === "match" ? legacy.matchRecord : input.serviceType === "followup" ? legacy.followUpRecord : input.serviceType === "reminder" ? legacy.reminderTask : undefined;
    if (!table) return [];
    const rows = table.findMany ? await table.findMany({ where: { storeId: input.storeId, ...(input.memberId ? { memberId: input.memberId } : {}) }, orderBy: { createdAt: "desc" } }) : await (table as unknown as { findFirst: (args: unknown) => Promise<unknown> }).findFirst({ where: { storeId: input.storeId, ...(input.memberId ? { memberId: input.memberId } : {}) } }).then((row) => row ? [row] : []);
    return (rows as ServicePayload[]).map((row) => ({ id: String(row.id), storeId: String(row.storeId), memberId: row.memberId ? String(row.memberId) : null, operatorId: String(row.operatorId ?? row.employeeId ?? row.createdById ?? ""), serviceType: input.serviceType ?? "", status: row.status ? String(row.status) : null, sourceTable: input.serviceType ?? "", sourceId: String(row.id), payloadJson: row as Prisma.JsonValue, createdAt: new Date(String(row.createdAt)), updatedAt: new Date(String(row.updatedAt)) }));
  }
  return client.findMany({
    where: { storeId: input.storeId, ...(input.memberId ? { memberId: input.memberId } : {}), ...(input.serviceType ? { serviceType: input.serviceType } : {}) },
    orderBy: { createdAt: "desc" },
  });
}

export async function createMemberService(
  tx: Pick<Prisma.TransactionClient, "memberService"> | typeof import("@/lib/server/prisma").prisma,
  data: { storeId: string; memberId?: string | null; operatorId?: string | null; serviceType: string; status?: string | null; sourceId?: string; payloadJson: ServicePayload; createdAt?: Date },
) {
  const client = (tx as unknown as { memberService?: typeof tx.memberService }).memberService;
  if (!client) {
    const legacy = tx as unknown as Record<string, { create?: (args: unknown) => Promise<ServicePayload>; upsert?: (args: unknown) => Promise<ServicePayload> }>;
    const table = data.serviceType === "blacklist" ? legacy.blacklistEntry : data.serviceType === "followup" ? legacy.followUpRecord : data.serviceType === "reminder" ? legacy.reminderTask : undefined;
    if (!table) throw new Error(`Unsupported service type: ${data.serviceType}`);
    const payload = data.payloadJson;
    const row = data.serviceType === "reminder" && table.upsert
      ? await table.upsert({ where: { storeId_idempotencyKey: { storeId: data.storeId, idempotencyKey: payload.idempotencyKey } }, create: { storeId: data.storeId, memberId: data.memberId ?? undefined, createdById: data.operatorId ?? undefined, assigneeEmployeeId: payload.assigneeEmployeeId, title: payload.title, description: payload.description, dueAt: new Date(String(payload.dueAt)), idempotencyKey: payload.idempotencyKey }, update: { status: "PENDING", completedAt: null } })
      : await table.create?.({ data: { storeId: data.storeId, memberId: data.memberId ?? undefined, createdById: data.operatorId ?? undefined, employeeId: data.operatorId ?? undefined, ...payload } });
    if (!row) throw new Error(`Unable to create ${data.serviceType}`);
    return { id: String(row.id), storeId: data.storeId, memberId: data.memberId ?? null, operatorId: data.operatorId ?? null, serviceType: data.serviceType, status: data.status ?? null, sourceTable: data.serviceType, sourceId: String(row.id), payloadJson: payload as Prisma.JsonValue, createdAt: new Date(), updatedAt: new Date() };
  }
  const sourceId = data.sourceId ?? crypto.randomUUID();
  return client.create({
    data: { ...data, memberId: data.memberId ?? null, operatorId: data.operatorId ?? null, status: data.status ?? null, sourceTable: "MemberService", sourceId, payloadJson: data.payloadJson as Prisma.InputJsonValue, ...(data.createdAt ? { createdAt: data.createdAt } : {}) },
  });
}

export async function findActiveBlacklistBlock(
  tx: Pick<Prisma.TransactionClient, "memberService"> | typeof import("@/lib/server/prisma").prisma,
  input: { storeId: string; memberId?: string | null; phoneHash?: string | null; idCardHash?: string | null },
) {
  const entries = await findMemberServices(tx, { storeId: input.storeId, serviceType: "blacklist" });
  const now = Date.now();
  return entries.map((entry) => ({ entry, payload: payloadOf(entry.payloadJson) })).filter(({ entry, payload }) => {
    const expiresAt = typeof payload.expiresAt === "string" ? Date.parse(payload.expiresAt) : null;
    if (expiresAt !== null && expiresAt <= now) return false;
    return (input.memberId && entry.memberId === input.memberId) || (input.phoneHash && payload.phoneHash === input.phoneHash) || (input.idCardHash && payload.idCardHash === input.idCardHash);
  }).map(({ entry, payload }) => ({ id: entry.id, reason: String(payload.reason ?? ""), severity: String(payload.severity ?? "MEDIUM"), status: "ACTIVE" as const, memberId: entry.memberId, expiresAt: typeof payload.expiresAt === "string" ? new Date(payload.expiresAt) : null })).sort((a, b) => b.severity.localeCompare(a.severity))[0] ?? null;
}
