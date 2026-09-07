import { z } from "zod";
import { ApiCode, apiResponse } from "@/lib/server/api-response";
import { findActiveBlacklistBlock } from "@/lib/server/blacklist";
import { prisma } from "@/lib/server/prisma";
import { createMemberService, findMemberServices, payloadOf } from "@/lib/server/member-service";
import {
  requireCurrentEmployee,
  requirePermission,
  resolveStoreScope,
  writeAuditLog,
} from "@/lib/server/route-helpers";

const followUpTypes = [
  "CALL",
  "WECHAT",
  "VISIT",
  "DATE_FEEDBACK",
  "COMPLAINT",
  "RETURN_VISIT",
  "OTHER",
] as const;

const createFollowUpSchema = z.object({
  storeId: z.string().trim().min(1).max(80).optional(),
  memberId: z.string().trim().min(1).max(80),
  matchId: z.string().trim().min(1).max(80).optional(),
  type: z.enum(followUpTypes).optional(),
  method: z.string().trim().min(1).max(40).optional(),
  content: z.string().trim().min(1).max(2000),
  nextAction: z.string().trim().max(240).optional(),
  nextAt: z.string().datetime({ offset: true }).optional(),
  nextFollowUpAt: z.string().datetime({ offset: true }).optional(),
  assigneeEmployeeId: z.string().trim().min(1).max(80).optional(),
}).refine((value) => value.type || value.method, {
  message: "type or method is required",
});

function validationError(request: Request) {
  return apiResponse(request, {
    code: ApiCode.BAD_REQUEST,
    message: "参数错误",
    data: null,
    status: 400,
  });
}

function normalizeFollowUpType(input: string | undefined): (typeof followUpTypes)[number] {
  if (input === "PHONE") {
    return "CALL";
  }

  if (input === "SYSTEM") {
    return "OTHER";
  }

  return followUpTypes.find((type) => type === input) ?? "OTHER";
}

export async function POST(request: Request) {
  const auth = await requireCurrentEmployee(request);

  if (auth instanceof Response) {
    return auth;
  }

  const forbidden = requirePermission(request, auth, "followup:write");

  if (forbidden) {
    return forbidden;
  }

  const body = await request.json().catch(() => null);
  const parsed = createFollowUpSchema.safeParse(body);

  if (!parsed.success) {
    return validationError(request);
  }

  const scope = await resolveStoreScope(request, auth, parsed.data.storeId);

  if (scope instanceof Response) {
    return scope;
  }

  const member = await prisma.member.findFirst({
    where: {
      id: parsed.data.memberId,
      storeId: scope.storeId,
    },
    select: {
      id: true,
      memberNo: true,
      ownerEmployeeId: true,
    },
  });

  if (!member) {
    return apiResponse(request, {
      code: ApiCode.NOT_FOUND,
      message: "资源不存在",
      data: null,
      status: 404,
    });
  }

  if (parsed.data.matchId) {
    const match = (prisma as typeof prisma & { memberService?: unknown }).memberService
      ? (await findMemberServices(prisma, { storeId: scope.storeId, serviceType: "match" })).find((item) => { const payload = payloadOf(item.payloadJson); return item.sourceId === parsed.data.matchId && (item.memberId === parsed.data.memberId || payload.candidateMemberId === parsed.data.memberId); })
      : await prisma.matchRecord.findFirst({ where: { id: parsed.data.matchId, storeId: scope.storeId, OR: [{ initiatorMemberId: parsed.data.memberId }, { candidateMemberId: parsed.data.memberId }] }, select: { id: true } });

    if (!match) {
      return apiResponse(request, {
        code: ApiCode.BAD_REQUEST,
        message: "匹配记录不存在或不属于该会员",
        data: null,
        status: 400,
      });
    }
  }

  const blacklistBlock = await findActiveBlacklistBlock(prisma, {
    storeId: scope.storeId,
    memberId: member.id,
  });

  if (blacklistBlock) {
    await writeAuditLog(prisma, request, auth, {
      storeId: scope.storeId,
      action: "BLACKLIST_BLOCK",
      resourceType: "FollowUpRecord",
      resourceId: member.id,
      metadata: {
        entryId: blacklistBlock.id,
        reason: blacklistBlock.reason,
        severity: blacklistBlock.severity,
        operation: "followup.create",
      },
    });

    return apiResponse(request, {
      code: ApiCode.BLACKLIST_BLOCKED,
      message: "黑名单拦截",
      data: {
        blacklistEntryId: blacklistBlock.id,
        severity: blacklistBlock.severity,
      },
      status: 409,
    });
  }

  const followUpType = normalizeFollowUpType(parsed.data.type ?? parsed.data.method);
  const nextAt = parsed.data.nextAt ?? parsed.data.nextFollowUpAt;
  const assigneeEmployeeId = parsed.data.assigneeEmployeeId ?? member.ownerEmployeeId;
  const assignee = await prisma.employee.findFirst({
    where: {
      id: assigneeEmployeeId,
      storeId: scope.storeId,
      status: "ACTIVE",
    },
    select: { id: true },
  });

  if (!assignee) {
    return apiResponse(request, {
      code: ApiCode.BAD_REQUEST,
      message: "提醒负责人不存在或不属于当前门店",
      data: null,
      status: 400,
    });
  }

  const created = await prisma.$transaction(async (tx) => {
    const followUp = await createMemberService(tx, { storeId: scope.storeId, memberId: parsed.data.memberId, operatorId: auth.employee.employeeId, serviceType: "followup", status: "RECORDED", sourceId: crypto.randomUUID(), payloadJson: { memberId: parsed.data.memberId, matchId: parsed.data.matchId ?? null, employeeId: auth.employee.employeeId, type: followUpType, content: parsed.data.content, nextAction: parsed.data.nextAction ?? null, nextAt: nextAt ?? null } });

    const reminder = nextAt ? await createMemberService(tx, { storeId: scope.storeId, memberId: parsed.data.memberId, operatorId: assigneeEmployeeId, serviceType: "reminder", status: "PENDING", sourceId: `followup:${followUp.id}`, payloadJson: { memberId: parsed.data.memberId, assigneeEmployeeId, createdById: auth.employee.employeeId, title: parsed.data.nextAction ?? "会员回访提醒", description: parsed.data.content, dueAt: nextAt, idempotencyKey: `followup:${followUp.id}` } }) : null;

    await writeAuditLog(tx, request, auth, {
      storeId: scope.storeId,
      action: "CREATE",
      resourceType: "FollowUpRecord",
      resourceId: followUp.id,
      metadata: {
        memberId: parsed.data.memberId,
        matchId: parsed.data.matchId ?? null,
        type: followUpType,
        hasReminder: Boolean(reminder),
        reminderId: reminder?.id ?? null,
      },
    });

    return { followUp, reminder };
  });

  return apiResponse(request, {
    code: ApiCode.OK,
    message: "创建成功",
    data: {
      id: created.followUp.id,
      storeId: created.followUp.storeId,
      memberId: created.followUp.memberId,
      matchId: payloadOf(created.followUp.payloadJson).matchId ?? null,
      employeeId: created.followUp.operatorId,
      method: payloadOf(created.followUp.payloadJson).type,
      type: payloadOf(created.followUp.payloadJson).type,
      content: payloadOf(created.followUp.payloadJson).content,
      nextAction: payloadOf(created.followUp.payloadJson).nextAction,
      nextFollowUpAt: typeof payloadOf(created.followUp.payloadJson).nextAt === "string" ? payloadOf(created.followUp.payloadJson).nextAt : null,
      nextAt: typeof payloadOf(created.followUp.payloadJson).nextAt === "string" ? payloadOf(created.followUp.payloadJson).nextAt : null,
      reminderId: created.reminder?.id ?? null,
      createdAt: created.followUp.createdAt.toISOString(),
    },
    status: 201,
  });
}
