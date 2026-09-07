import { z } from "zod";
import { ApiCode, apiResponse, apiSuccess } from "@/lib/server/api-response";
import { prisma } from "@/lib/server/prisma";
import { requireCurrentEmployee, requirePermission, writeAuditLog } from "@/lib/server/route-helpers";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const updateStoreSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  address: z.string().trim().max(160).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
}).refine((value) => value.name || value.address !== undefined || value.phone !== undefined || value.status, {
  message: "at least one field is required",
});

function requireStoreManager(request: Request, auth: Awaited<ReturnType<typeof requireCurrentEmployee>>) {
  if (auth instanceof Response) return auth;

  const forbidden = requirePermission(request, auth, "role:write");
  if (forbidden) return forbidden;

  if (auth.employee.roleLevel !== "manager") {
    return apiResponse(request, {
      code: ApiCode.FORBIDDEN,
      message: "仅管理员可以管理门店",
      data: null,
      status: 403,
    });
  }

  return null;
}

function storeToItem(store: {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}, counts?: { employeeCount: number; memberCount: number }) {
  return {
    id: store.id,
    name: store.name,
    address: store.address ?? "",
    phone: store.phone ?? "",
    status: store.status,
    employeeCount: counts?.employeeCount ?? 0,
    memberCount: counts?.memberCount ?? 0,
    createdAt: store.createdAt.toISOString(),
    updatedAt: store.updatedAt.toISOString(),
  };
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireCurrentEmployee(request);
  if (auth instanceof Response) return auth;

  const guard = requireStoreManager(request, auth);
  if (guard) return guard;

  const payload = await request.json().catch(() => null);
  const parsed = updateStoreSchema.safeParse(payload);
  if (!parsed.success) {
    return apiResponse(request, {
      code: ApiCode.BAD_REQUEST,
      message: "参数错误",
      data: null,
      status: 400,
    });
  }

  const id = (await context.params).id;
  const current = await prisma.store.findUnique({ where: { id } });
  if (!current) {
    return apiResponse(request, {
      code: ApiCode.NOT_FOUND,
      message: "门店不存在",
      data: null,
      status: 404,
    });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const store = await tx.store.update({
      where: { id },
      data: {
        ...(parsed.data.name ? { name: parsed.data.name } : {}),
        ...(parsed.data.address !== undefined ? { address: parsed.data.address || null } : {}),
        ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone || null } : {}),
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
      },
    });

    await writeAuditLog(tx, request, auth, {
      storeId: store.id,
      action: "UPDATE",
      resourceType: "Store",
      resourceId: store.id,
      before: storeToItem(current),
      after: storeToItem(store),
      metadata: { name: store.name },
    });

    return store;
  });

  const [employeeCount, memberCount] = await Promise.all([
    prisma.employee.count({ where: { storeId: updated.id } }),
    prisma.member.count({ where: { storeId: updated.id } }),
  ]);

  return apiSuccess(request, storeToItem(updated, { employeeCount, memberCount }), "更新成功");
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireCurrentEmployee(request);
  if (auth instanceof Response) return auth;

  const guard = requireStoreManager(request, auth);
  if (guard) return guard;

  const id = (await context.params).id;
  const current = await prisma.store.findUnique({ where: { id } });
  if (!current) {
    return apiResponse(request, {
      code: ApiCode.NOT_FOUND,
      message: "门店不存在",
      data: null,
      status: 404,
    });
  }

  const [employeeCount, memberCount] = await Promise.all([
    prisma.employee.count({ where: { storeId: id } }),
    prisma.member.count({ where: { storeId: id } }),
  ]);

  if (employeeCount > 0 || memberCount > 0) {
    return apiResponse(request, {
      code: ApiCode.CONFLICT,
      message: "门店已有员工或会员，不能删除",
      data: { employeeCount, memberCount },
      status: 409,
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.store.delete({ where: { id } });
    await writeAuditLog(tx, request, auth, {
      storeId: id,
      action: "DELETE",
      resourceType: "Store",
      resourceId: id,
      before: storeToItem(current),
      metadata: { name: current.name },
    });
  });

  return apiSuccess(request, { id }, "删除成功");
}
