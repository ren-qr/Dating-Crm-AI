/** Product authorization has two levels; legacy role codes normalize here. */
export type RoleLevel = "manager" | "staff";

export type RoleLevelInfo = {
  roleLevel: RoleLevel;
  roleName: string;
};

const managerRoleCodes = new Set([
  "owner",
  "admin",
  "bootstrap-admin",
  "manager",
  "store_manager",
  "store-manager",
]);

const roleNames: Record<RoleLevel, string> = {
  manager: "管理员",
  staff: "员工",
};

export function resolveRoleLevel(roleCodes: string[]): RoleLevelInfo {
  if (roleCodes.some((code) => managerRoleCodes.has(code))) {
    return { roleLevel: "manager", roleName: roleNames.manager };
  }

  return { roleLevel: "staff", roleName: roleNames.staff };
}
