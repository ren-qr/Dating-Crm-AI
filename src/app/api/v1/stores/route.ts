import { z } from "zod";
import { ApiCode, apiResponse, apiSuccess } from "@/lib/server/api-response";
import { prisma } from "@/lib/server/prisma";
import { requireCurrentEmployee, requirePermission, writeAuditLog } from "@/lib/server/route-helpers";

const createStoreSchema = z.object({
  id: z.string().trim().min(2).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().trim().min(2).max(80),
  address: z.string().trim().max(160).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
});

const storeRoleCodes = ["admin", "store_manager", "consultant"];

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
  _count?: { employees?: number; members?: number };
}) {
  return {
    id: store.id,
    name: store.name,
    address: store.address ?? "",
    phone: store.phone ?? "",
    status: store.status,
    employeeCount: store._count?.employees ?? 0,
    memberCount: store._count?.members ?? 0,
    createdAt: store.createdAt.toISOString(),
    updatedAt: store.updatedAt.toISOString(),
  };
}

export async function GET(request: Request) {
  const auth = await requireCurrentEmployee(request);
  if (auth instanceof Response) return auth;

  const stores = await prisma.store.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });
  const counts = await Promise.all(stores.map(async (store) => ({
    id: store.id,
    employeeCount: await prisma.employee.count({ where: { storeId: store.id } }),
    memberCount: await prisma.member.count({ where: { storeId: store.id } }),
  })));
  const countMap = new Map(counts.map((item) => [item.id, item]));

  return apiSuccess(request, {
    items: stores.map((store) => {
      const count = countMap.get(store.id);
      return storeToItem({ ...store, _count: { employees: count?.employeeCount ?? 0, members: count?.memberCount ?? 0 } });
    }),
  });
}

export async function POST(request: Request) {
  const auth = await requireCurrentEmployee(request);
  if (auth instanceof Response) return auth;

  const guard = requireStoreManager(request, auth);
  if (guard) return guard;

  const payload = await request.json().catch(() => null);
  const parsed = createStoreSchema.safeParse(payload);
  if (!parsed.success) {
    return apiResponse(request, {
      code: ApiCode.BAD_REQUEST,
      message: "参数错误",
      data: null,
      status: 400,
    });
  }

  const duplicated = await prisma.store.findUnique({ where: { id: parsed.data.id }, select: { id: true } });
  if (duplicated) {
    return apiResponse(request, {
      code: ApiCode.CONFLICT,
      message: "门店编号已存在",
      data: null,
      status: 409,
    });
  }

  const created = await prisma.$transaction(async (tx) => {
    const store = await tx.store.create({
      data: {
        id: parsed.data.id,
        name: parsed.data.name,
        address: parsed.data.address || null,
        phone: parsed.data.phone || null,
        status: "ACTIVE",
      },
    });
    const roleTemplates = await tx.role.findMany({
      where: { code: { in: storeRoleCodes } },
      include: { permissions: { select: { code: true } } },
      orderBy: { createdAt: "asc" },
    });
    const seenRoleCodes = new Set<string>();

    for (const template of roleTemplates) {
      if (seenRoleCodes.has(template.code)) continue;
      seenRoleCodes.add(template.code);
      await tx.role.create({
        data: {
          storeId: store.id,
          code: template.code,
          name: template.name,
          description: template.description,
          permissions: {
            connect: template.permissions.map((permission) => ({ code: permission.code })),
          },
        },
      });
    }

    await writeAuditLog(tx, request, auth, {
      storeId: store.id,
      action: "CREATE",
      resourceType: "Store",
      resourceId: store.id,
      after: storeToItem(store),
      metadata: { name: store.name },
    });

    return store;
  });

  return apiResponse(request, {
    code: ApiCode.OK,
    message: "创建成功",
    data: storeToItem(created),
    status: 201,
  });
}
