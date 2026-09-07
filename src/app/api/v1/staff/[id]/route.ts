import { z } from "zod";
import { resolveRoleLevel, type RoleLevel } from "@/business-support/permissions/role-level";
import { ApiCode, apiResponse, apiSuccess } from "@/lib/server/api-response";
import { prisma } from "@/lib/server/prisma";
import {
  requireCurrentEmployee,
  requirePermission,
  resolveStoreScope,
  writeAuditLog,
} from "@/lib/server/route-helpers";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const updateStaffSchema = z.object({
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  roleLevel: z.enum(["manager", "staff"]).optional(),
  name: z.string().trim().min(2).max(40).optional(),
  email: z.string().trim().email().max(160).optional(),
  storeId: z.string().trim().min(1).max(80).optional(),
}).refine((value) => value.status || value.roleLevel || value.name || value.email || value.storeId, {
  message: "at least one field is required",
});

function canManageRole(managerLevel: RoleLevel, targetLevel: RoleLevel) {
  if (managerLevel === "manager") {
    return targetLevel === "staff";
  }

  return false;
}

function roleCodeForLevel(level: "manager" | "staff") {
  return level === "manager" ? "store_manager" : "consultant";
}

function staffToItem(employee: {
  id: string;
  storeId: string;
  email: string;
  name: string;
  status: "ACTIVE" | "DISABLED";
  createdAt: Date;
  updatedAt: Date;
  roles: { role: { code: string } }[];
}) {
  const roleCodes = employee.roles.map((assignment) => assignment.role.code);
  return {
    ...resolveRoleLevel(roleCodes),
    id: employee.id,
    storeId: employee.storeId,
    email: employee.email,
    name: employee.name,
    status: employee.status,
    roleCodes,
    createdAt: employee.createdAt.toISOString(),
    updatedAt: employee.updatedAt.toISOString(),
  };
}

function canUpdateIdentity(authLevel: RoleLevel, targetLevel: RoleLevel, isSelf: boolean) {
  if (authLevel === "manager") return isSelf || targetLevel === "staff";
  return isSelf;
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireCurrentEmployee(request);
  if (auth instanceof Response) return auth;

  const forbidden = requirePermission(request, auth, "staff:write");
  if (forbidden) return forbidden;

  if (auth.employee.roleLevel === "staff") {
    return apiResponse(request, {
      code: ApiCode.FORBIDDEN,
      message: "员工无权调整账号",
      data: null,
      status: 403,
    });
  }

  const payload = await request.json().catch(() => null);
  const parsed = updateStaffSchema.safeParse(payload);
  if (!parsed.success) {
    return apiResponse(request, {
      code: ApiCode.BAD_REQUEST,
      message: "参数错误",
      data: null,
      status: 400,
    });
  }

  const scope = await resolveStoreScope(request, auth);
  if (scope instanceof Response) return scope;

  const id = (await context.params).id;
  const isSelf = id === auth.employee.employeeId;
  if (isSelf && (parsed.data.status || parsed.data.roleLevel || parsed.data.storeId)) {
    return apiResponse(request, {
      code: ApiCode.CONFLICT,
      message: "不能调整当前登录账号的状态、职级或门店",
      data: null,
      status: 409,
    });
  }

  const current = await prisma.employee.findFirst({
    where: { id, storeId: scope.storeId },
    include: {
      roles: {
        include: {
          role: { select: { code: true } },
        },
      },
    },
  });

  if (!current) {
    return apiResponse(request, {
      code: ApiCode.NOT_FOUND,
      message: "员工不存在",
      data: null,
      status: 404,
    });
  }

  const targetRole = resolveRoleLevel(current.roles.map((assignment) => assignment.role.code));
  const identityChange = parsed.data.name !== undefined || parsed.data.email !== undefined;
  const privilegedChange = parsed.data.status !== undefined || parsed.data.roleLevel !== undefined || parsed.data.storeId !== undefined;

  if (identityChange && !canUpdateIdentity(auth.employee.roleLevel, targetRole.roleLevel, isSelf)) {
    return apiResponse(request, {
      code: ApiCode.FORBIDDEN,
      message: "无权修改该账号信息",
      data: null,
      status: 403,
    });
  }

  if (privilegedChange && !canManageRole(auth.employee.roleLevel, targetRole.roleLevel)) {
    return apiResponse(request, {
      code: ApiCode.FORBIDDEN,
      message: "无权调整该账号",
      data: null,
      status: 403,
    });
  }

  if (parsed.data.roleLevel && !canManageRole(auth.employee.roleLevel, parsed.data.roleLevel)) {
    return apiResponse(request, {
      code: ApiCode.FORBIDDEN,
      message: "无权任命该职级",
      data: null,
      status: 403,
    });
  }

  if (parsed.data.email && parsed.data.email !== current.email) {
    const duplicated = await prisma.employee.findUnique({
      where: { storeId_email: { storeId: parsed.data.storeId ?? current.storeId, email: parsed.data.email } },
      select: { id: true },
    });

    if (duplicated && duplicated.id !== current.id) {
      return apiResponse(request, {
        code: ApiCode.CONFLICT,
        message: "该邮箱账号已存在",
        data: null,
        status: 409,
      });
    }
  }

  const nextRole = parsed.data.roleLevel
    ? await prisma.role.findUnique({
        where: { storeId_code: { storeId: parsed.data.storeId ?? current.storeId, code: roleCodeForLevel(parsed.data.roleLevel) } },
      })
    : null;

  if (parsed.data.roleLevel && !nextRole) {
    return apiResponse(request, {
      code: ApiCode.CONFLICT,
      message: "角色未初始化，请先运行种子数据",
      data: null,
      status: 409,
    });
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (nextRole) {
      await tx.staffRole.deleteMany({
        where: { employeeId: current.id },
      });
      await tx.staffRole.create({
        data: {
          employeeId: current.id,
          roleId: nextRole.id,
          storeId: parsed.data.storeId ?? current.storeId,
        },
      });
    } else if (parsed.data.storeId) {
      await tx.staffRole.updateMany({
        where: { employeeId: current.id },
        data: { storeId: parsed.data.storeId },
      });
    }

    const employee = await tx.employee.update({
      where: { id: current.id },
      data: {
        ...(parsed.data.name ? { name: parsed.data.name } : {}),
        ...(parsed.data.email ? { email: parsed.data.email } : {}),
        ...(parsed.data.storeId ? { storeId: parsed.data.storeId } : {}),
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
        updatedById: auth.employee.employeeId,
      },
      include: {
        roles: {
          include: {
            role: { select: { code: true } },
          },
        },
      },
    });

    await writeAuditLog(tx, request, auth, {
      storeId: scope.storeId,
      action: "UPDATE",
      resourceType: "Employee",
      resourceId: employee.id,
      before: { status: current.status, roleLevel: targetRole.roleLevel, name: current.name, email: current.email, storeId: current.storeId },
      after: { status: employee.status, roleLevel: parsed.data.roleLevel ?? targetRole.roleLevel, name: employee.name, email: employee.email, storeId: employee.storeId },
      metadata: {
        email: employee.email,
        roleLevel: parsed.data.roleLevel ?? targetRole.roleLevel,
      },
    });

    return employee;
  });

  return apiSuccess(request, staffToItem(updated), "更新成功");
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireCurrentEmployee(request);
  if (auth instanceof Response) return auth;

  const forbidden = requirePermission(request, auth, "staff:write");
  if (forbidden) return forbidden;

  if (auth.employee.roleLevel === "staff") {
    return apiResponse(request, {
      code: ApiCode.FORBIDDEN,
      message: "员工无权删除账号",
      data: null,
      status: 403,
    });
  }

  const scope = await resolveStoreScope(request, auth);
  if (scope instanceof Response) return scope;

  const id = (await context.params).id;
  if (id === auth.employee.employeeId) {
    return apiResponse(request, {
      code: ApiCode.CONFLICT,
      message: "不能删除当前登录账号",
      data: null,
      status: 409,
    });
  }

  const current = await prisma.employee.findFirst({
    where: auth.employee.roleLevel === "manager" ? { id } : { id, storeId: scope.storeId },
    include: {
      roles: {
        include: {
          role: { select: { code: true } },
        },
      },
      _count: {
        select: {
          ownedMembers: true,
          followUps: true,
          createdBillingOrders: true,
          paymentRecords: true,
          assignedCustomers: true,
          assignedReminders: true,
          exportJobs: true,
        },
      },
    },
  });

  if (!current) {
    return apiResponse(request, {
      code: ApiCode.NOT_FOUND,
      message: "员工不存在",
      data: null,
      status: 404,
    });
  }

  const targetRole = resolveRoleLevel(current.roles.map((assignment) => assignment.role.code));
  if (!canManageRole(auth.employee.roleLevel, targetRole.roleLevel)) {
    return apiResponse(request, {
      code: ApiCode.FORBIDDEN,
      message: "无权删除该账号",
      data: null,
      status: 403,
    });
  }

  const dependencyCount =
    current._count.ownedMembers +
    current._count.followUps +
    current._count.createdBillingOrders +
    current._count.paymentRecords +
    current._count.assignedCustomers +
    current._count.assignedReminders +
    current._count.exportJobs;

  if (dependencyCount > 0) {
    return apiResponse(request, {
      code: ApiCode.CONFLICT,
      message: "员工仍有关联业务数据，请先转移会员或停用账号",
      data: null,
      status: 409,
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.employee.delete({ where: { id: current.id } });

    await writeAuditLog(tx, request, auth, {
      storeId: current.storeId,
      action: "DELETE",
      resourceType: "Employee",
      resourceId: current.id,
      before: {
        name: current.name,
        email: current.email,
        roleLevel: targetRole.roleLevel,
        status: current.status,
        storeId: current.storeId,
      },
      metadata: {
        email: current.email,
        roleLevel: targetRole.roleLevel,
      },
    });
  });

  return apiSuccess(request, { id: current.id }, "删除成功");
}
