export const permissionCodes = [
  "member:read",
  "member:write",
  "member:delete",
  "profile:read",
  "profile:write",
  "document:read",
  "document:write",
  "document:delete",
  "match:read",
  "match:write",
  "match:execute",
  "followup:read",
  "followup:write",
  "activity:read",
  "activity:write",
  "activity:checkin",
  "billing:read",
  "billing:write",
  "finance:read",
  "finance:write",
  "staff:read",
  "staff:write",
  "role:read",
  "role:write",
  "customer:read",
  "customer:assign",
  "customer:commission",
  "blacklist:read",
  "blacklist:write",
  "reminder:read",
  "reminder:write",
  "audit:read",
  "export:read",
  "export:write",
] as const;

export type PermissionCode = (typeof permissionCodes)[number];

export function hasPermission(
  permissions: readonly string[] | undefined,
  requiredPermission: PermissionCode,
): boolean {
  return permissions?.includes(requiredPermission) ?? false;
}

export function hasEveryPermission(
  permissions: readonly string[] | undefined,
  requiredPermissions: readonly PermissionCode[],
): boolean {
  return requiredPermissions.every((permission) =>
    hasPermission(permissions, permission),
  );
}

export function uniqueCodes(codes: string[]): string[] {
  return [...new Set(codes)].sort();
}
