import { getCurrentEmployee } from "@/business-support/permissions/current-user";
import { ApiCode, apiResponse, apiSuccess } from "@/lib/server/api-response";
import { prisma } from "@/lib/server/prisma";

export async function GET(request: Request) {
  const employee = await getCurrentEmployee();

  if (!employee) {
    return apiResponse(request, {
      code: ApiCode.UNAUTHENTICATED,
      message: "未认证",
      data: null,
      status: 401,
    });
  }

  const persistedEmployee = await prisma.employee.findUnique({
    where: { id: employee.employeeId },
    select: { storeId: true },
  });
  const store = persistedEmployee?.storeId
    ? await prisma.store.findUnique({
        where: { id: persistedEmployee.storeId },
        select: { name: true },
      })
    : null;

  return apiSuccess(request, {
    employeeId: employee.employeeId,
    email: employee.email,
    name: employee.name,
    storeId: persistedEmployee?.storeId ?? null,
    storeName: store?.name ?? null,
    roleCodes: employee.roleCodes,
    roleLevel: employee.roleLevel,
    roleName: employee.roleName,
    permissions: employee.permissions,
  });
}
