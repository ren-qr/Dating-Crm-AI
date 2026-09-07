import type { Prisma } from "@prisma/client";
import { hashSensitiveValue, normalizePhone } from "@/lib/server/sensitive-fields";
import { findActiveBlacklistBlock as findMemberServiceBlacklistBlock } from "@/lib/server/member-service";

type BlacklistCheckInput = {
  storeId: string;
  memberId?: string | null;
  phone?: string | null;
  idCard?: string | null;
};

export async function findActiveBlacklistBlock(
  tx: Parameters<typeof findMemberServiceBlacklistBlock>[0],
  input: BlacklistCheckInput,
) {
  const phoneHash = input.phone ? hashSensitiveValue(normalizePhone(input.phone)) : null;
  const idCardHash = input.idCard ? hashSensitiveValue(input.idCard.trim().toUpperCase()) : null;
  if (!(tx as unknown as { memberService?: unknown }).memberService) {
    const orFilters: Prisma.BlacklistEntryWhereInput[] = [];
    if (input.memberId) orFilters.push({ memberId: input.memberId });
    if (phoneHash) orFilters.push({ phoneHash });
    if (idCardHash) orFilters.push({ idCardHash });
    if (!orFilters.length) return null;
    const legacy = tx as unknown as { blacklistEntry: Prisma.TransactionClient["blacklistEntry"] };
    return legacy.blacklistEntry.findFirst({ where: { storeId: input.storeId, status: "ACTIVE", OR: orFilters }, orderBy: [{ severity: "desc" }, { createdAt: "desc" }], select: { id: true, reason: true, severity: true, status: true, memberId: true, expiresAt: true } });
  }
  return findMemberServiceBlacklistBlock(tx, { storeId: input.storeId, memberId: input.memberId, phoneHash, idCardHash });
}
