import { getServerSession } from "next-auth";
import { authOptions } from "@/business-support/permissions/options";
import { resolveRoleLevel, type RoleLevel } from "@/business-support/permissions/role-level";

export type CurrentEmployee = {
  employeeId: string;
  storeId: string | null;
  email: string;
  name: string | null;
  roleCodes: string[];
  roleLevel: RoleLevel;
  roleName: string;
  permissions: string[];
};

export async function getCurrentEmployee(): Promise<CurrentEmployee | null> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.employeeId || !session.user.email) {
    return null;
  }

  const roleInfo = resolveRoleLevel(session.user.roleCodes);

  return {
    employeeId: session.user.employeeId,
    storeId: session.user.storeId ?? null,
    email: session.user.email,
    name: session.user.name ?? null,
    roleCodes: session.user.roleCodes,
    roleLevel: roleInfo.roleLevel,
    roleName: roleInfo.roleName,
    permissions: session.user.permissions,
  };
}
