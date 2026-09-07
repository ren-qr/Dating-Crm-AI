import { apiSuccess } from "@/lib/server/api-response";
import { resolveRoleLevel } from "@/business-support/permissions/role-level";
import { prisma } from "@/lib/server/prisma";
import {
  requireCurrentEmployee,
  requirePermission,
} from "@/lib/server/route-helpers";

export async function GET(request: Request) {
  const auth = await requireCurrentEmployee(request);

  if (auth instanceof Response) {
    return auth;
  }

  const forbidden = requirePermission(request, auth, "member:write");
  if (forbidden) {
    return forbidden;
  }

  const requestedStoreId = new URL(request.url).searchParams.get("storeId")?.trim() || undefined;
  const storeId = requestedStoreId ?? auth.employee.storeId ?? process.env.DEMO_STORE_ID ?? "demo-store-shanghai";

  const employees = await prisma.employee.findMany({
    where: {
      storeId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
      roles: {
        select: {
          role: { select: { code: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return apiSuccess(request, {
    storeId,
    items: employees.map((employee) => ({
      ...resolveRoleLevel(employee.roles.map((assignment) => assignment.role.code)),
      id: employee.id,
      name: employee.name,
      roleCodes: employee.roles.map((assignment) => assignment.role.code),
    })),
  });
}
