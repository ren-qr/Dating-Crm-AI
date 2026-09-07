import type { Prisma } from "@prisma/client";
import { getCurrentEmployee, type CurrentEmployee } from "@/business-support/permissions/current-user";
import { hasPermission, type PermissionCode } from "@/business-support/permissions/permissions";
import { ApiCode, apiResponse, getRequestId } from "@/lib/server/api-response";
import { prisma } from "@/lib/server/prisma";
import { hashSensitiveValue } from "@/lib/server/sensitive-fields";

export type AuthContext = {
  employee: CurrentEmployee;
  isBootstrapAdmin: boolean;
  employeeStoreId: string | null;
};

export type StoreScope = {
  storeId: string;
};

export type MemberEditTarget = {
  storeId: string;
  ownerEmployeeId: string;
};

/** Member identity fields follow member-read permission, not staff level. */
export function canViewMemberIdentity(
  context: AuthContext,
  member: MemberEditTarget,
): boolean {
  void context;
  void member;
  return true;
}

export function requireMemberContactEditScope(
  request: Request,
  context: AuthContext,
  member: MemberEditTarget,
): Response | null {
  if (canViewMemberIdentity(context, member)) {
    return null;
  }

  return apiResponse(request, {
    code: ApiCode.FORBIDDEN,
    message: "仅归属顾问可修改会员联系方式与证件信息",
    data: null,
    status: 403,
  });
}

export function isBootstrapAdmin(employee: CurrentEmployee): boolean {
  return (
    employee.employeeId === "bootstrap-admin" ||
    employee.roleCodes.includes("bootstrap-admin")
  );
}

export async function requireCurrentEmployee(
  request: Request,
): Promise<AuthContext | Response> {
  const employee = await getCurrentEmployee();

  if (!employee) {
    return apiResponse(request, {
      code: ApiCode.UNAUTHENTICATED,
      message: "未认证",
      data: null,
      status: 401,
    });
  }

  const bootstrapAdmin = isBootstrapAdmin(employee);
  return {
    employee,
    isBootstrapAdmin: bootstrapAdmin,
    employeeStoreId: employee.storeId,
  };
}

export function requirePermission(
  request: Request,
  context: AuthContext,
  permission: PermissionCode,
): Response | null {
  if (context.isBootstrapAdmin || hasPermission(context.employee.permissions, permission)) {
    return null;
  }

  return apiResponse(request, {
    code: ApiCode.FORBIDDEN,
    message: "无权限",
    data: null,
    status: 403,
  });
}

export async function resolveStoreScope(
  request: Request,
  context: AuthContext,
  requestedStoreId?: string,
): Promise<StoreScope | Response> {
  if (context.isBootstrapAdmin) {
    const fallbackStoreId = process.env.DEMO_STORE_ID ?? "demo-store-shanghai";

    return { storeId: requestedStoreId ?? fallbackStoreId };
  }

  const persistedEmployee = await prisma.employee.findUnique({
    where: { id: context.employee.employeeId },
    select: { storeId: true },
  });

  if (!persistedEmployee) {
    return apiResponse(request, {
      code: ApiCode.FORBIDDEN,
      message: "无权限",
      data: null,
      status: 403,
    });
  }

  if (context.employee.roleLevel === "manager") {
    return { storeId: requestedStoreId ?? persistedEmployee.storeId };
  }

  if (requestedStoreId && requestedStoreId !== persistedEmployee.storeId) {
    return apiResponse(request, {
      code: ApiCode.FORBIDDEN,
      message: "无权限访问该门店",
      data: null,
      status: 403,
    });
  }

  return { storeId: persistedEmployee.storeId };
}

export async function requireMemberEditScope(
  request: Request,
  context: AuthContext,
  member: MemberEditTarget,
): Promise<Response | null> {
  if (context.isBootstrapAdmin) {
    return null;
  }

  if (
    context.employee.storeId !== member.storeId ||
    context.employee.employeeId !== member.ownerEmployeeId
  ) {
    return apiResponse(request, {
      code: ApiCode.FORBIDDEN,
      message: "无权修改该会员",
      data: null,
      status: 403,
    });
  }

  return null;
}

export function actorEmployeeId(context: AuthContext): string | null {
  return context.isBootstrapAdmin ? null : context.employee.employeeId;
}

export async function writeAuditLog(
  tx: Pick<Prisma.TransactionClient, "auditLog">,
  request: Request,
  context: AuthContext,
  input: {
    storeId: string;
    action: "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "LOGOUT" | "EXPORT" | "IMPORT" | "ASSIGN" | "MATCH" | "CHECK_IN" | "PAYMENT" | "BLACKLIST_BLOCK" | "UPLOAD";
    resourceType: string;
    resourceId?: string | null;
    before?: unknown;
    after?: unknown;
    metadata?: Prisma.InputJsonValue;
  },
) {
  const serialize = (value: unknown) =>
    value === undefined ? null : JSON.stringify(value);

  const before = serialize(input.before);
  const after = serialize(input.after);
  const userAgent = request.headers.get("user-agent");
  const forwardedFor = request.headers.get("x-forwarded-for");

  return tx.auditLog.create({
    data: {
      storeId: input.storeId,
      actorEmployeeId: actorEmployeeId(context),
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      requestId: getRequestId(request),
      beforeHash: before ? hashSensitiveValue(before) : null,
      afterHash: after ? hashSensitiveValue(after) : null,
      metadataJson: input.metadata,
      ipHash: forwardedFor ? hashSensitiveValue(forwardedFor.split(",")[0]?.trim() ?? forwardedFor) : null,
      userAgentHash: userAgent ? hashSensitiveValue(userAgent) : null,
    },
  });
}
