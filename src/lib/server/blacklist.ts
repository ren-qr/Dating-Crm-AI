import type { Prisma } from "@prisma/client";
import { hashSensitiveValue, normalizePhone } from "@/lib/server/sensitive-fields";

type BlacklistClient = Pick<Prisma.TransactionClient, "blacklistEntry">;

export async function findActiveBlacklistBlock(
  client: BlacklistClient,
  input: { storeId: string; memberId?: string | null; phone?: string | null; idCard?: string | null },
) {
  const phoneHash = input.phone ? hashSensitiveValue(normalizePhone(input.phone)) : null;
  const idCardHash = input.idCard ? hashSensitiveValue(input.idCard.trim().toUpperCase()) : null;
  const matches: Prisma.BlacklistEntryWhereInput[] = [];
  if (input.memberId) matches.push({ memberId: input.memberId });
  if (phoneHash) matches.push({ phoneHash });
  if (idCardHash) matches.push({ idCardHash });
  if (!matches.length) return null;
  return client.blacklistEntry.findFirst({
    where: { storeId: input.storeId, status: "ACTIVE", OR: matches },
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    select: { id: true, reason: true, severity: true, status: true, memberId: true, expiresAt: true },
  });
}
