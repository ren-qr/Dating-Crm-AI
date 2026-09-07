import { hash } from "bcryptjs";
import { z } from "zod";
import { resolveRoleLevel, type RoleLevel } from "@/business-support/permissions/role-level";
import { ApiCode, apiResponse, apiSuccess } from "@/lib/server/api-response";
import { prisma } from "@/lib/server/prisma";
import {
  actorEmployeeId,
  requireCurrentEmployee,
  requirePermission,
  resolveStoreScope,
  writeAuditLog,
} from "@/lib/server/route-helpers";

const createStaffSchema = z.object({
  email: z.string().trim().email().max(160),
  name: z.string().trim().min(2).max(40),
  password: z.string().min(8).max(80),
  roleLevel: z.enum(["manager", "staff"]),
  storeId: z.string().trim().min(1).max(80).optional(),
});

function canManageRole(managerLevel: RoleLevel, targetLevel: RoleLevel) {
  if (managerLevel === "manager") {
    return targetLevel === "staff";
  }

  return false;
}

function roleCodeForLevel(level: RoleLevel) {
  return level === "manager" ? "store_manager" : "consultant";
}

async function ensureRoleForStore(storeId: string, roleCode: string) {
  const existing = await prisma.role.findUnique({
    where: { storeId_code: { storeId, code: roleCode } },
  });
  if (existing) return existing;

  const template = await prisma.role.findFirst({
    where: { code: roleCode },
    include: { permissions: { select: { code: true } } },
  });
  if (!template) return null;

  return prisma.role.create({
    data: {
      storeId,
      code: roleCode,
      name: template.name,
      description: template.description,
      permissions: {
        connect: template.permissions.map((permission) => ({ code: permission.code })),
      },
    },
  });
}

function validationError(request: Request) {
  return apiResponse(request, {
    code: ApiCode.BAD_REQUEST,
    message: "参数错误",
    data: null,
    status: 400,
  });
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

export async function GET(request: Request) {
  const auth = await requireCurrentEmployee(request);
  if (auth instanceof Response) return auth;

  const forbidden = requirePermission(request, auth, "staff:read");
  if (forbidden) return forbidden;

  if (auth.employee.roleLevel === "staff") {
    return apiResponse(request, {
      code: ApiCode.FORBIDDEN,
      message: "员工无权查看人员管理",
      data: null,
      status: 403,
    });
  }

  const scope = await resolveStoreScope(request, auth);
  if (scope instanceof Response) return scope;
  const managerCanViewAllStores = auth.employee.roleLevel === "manager";

  const employees = await prisma.employee.findMany({
    where: managerCanViewAllStores ? {} : { storeId: scope.storeId },
    include: {
      roles: {
        include: {
          role: { select: { code: true } },
        },
      },
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });

  return apiSuccess(request, {
    storeId: managerCanViewAllStores ? null : scope.storeId,
    items: employees
      .map(staffToItem)
      .filter((item) => managerCanViewAllStores || item.roleLevel === "staff"),
  });
}

export async function POST(request: Request) {
  const auth = await requireCurrentEmployee(request);
  if (auth instanceof Response) return auth;

  const forbidden = requirePermission(request, auth, "staff:write");
  if (forbidden) return forbidden;

  if (auth.employee.roleLevel === "staff") {
    return apiResponse(request, {
      code: ApiCode.FORBIDDEN,
      message: "员工无权新增账号",
      data: null,
      status: 403,
    });
  }

  const payload = await request.json().catch(() => null);
  const parsed = createStaffSchema.safeParse(payload);
  if (!parsed.success) return validationError(request);

  if (!canManageRole(auth.employee.roleLevel, parsed.data.roleLevel)) {
    return apiResponse(request, {
      code: ApiCode.FORBIDDEN,
      message: "无权创建该角色",
      data: null,
      status: 403,
    });
  }

  const scope = await resolveStoreScope(request, auth);
  if (scope instanceof Response) return scope;
  const targetStoreId = parsed.data.storeId ?? scope.storeId;

  const roleCode = roleCodeForLevel(parsed.data.roleLevel);
  const role = await ensureRoleForStore(targetStoreId, roleCode);

  if (!role) {
    return apiResponse(request, {
      code: ApiCode.CONFLICT,
      message: "角色未初始化，请先运行种子数据",
      data: null,
      status: 409,
    });
  }

  const duplicated = await prisma.employee.findUnique({
    where: { storeId_email: { storeId: targetStoreId, email: parsed.data.email } },
    select: { id: true },
  });

  if (duplicated) {
    return apiResponse(request, {
      code: ApiCode.CONFLICT,
      message: "该邮箱账号已存在",
      data: null,
      status: 409,
    });
  }

  const created = await prisma.$transaction(async (tx) => {
    const employee = await tx.employee.create({
      data: {
        storeId: targetStoreId,
        email: parsed.data.email,
        name: parsed.data.name,
        passwordHash: await hash(parsed.data.password, 12),
        status: "ACTIVE",
        createdById: actorEmployeeId(auth),
        roles: {
          create: {
            storeId: targetStoreId,
            roleId: role.id,
          },
        },
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
      storeId: targetStoreId,
      action: "CREATE",
      resourceType: "Employee",
      resourceId: employee.id,
      metadata: {
        email: employee.email,
        roleLevel: parsed.data.roleLevel,
      },
    });

    return employee;
  });

  return apiResponse(request, {
    code: ApiCode.OK,
    message: "创建成功",
    data: staffToItem(created),
    status: 201,
  });
}
