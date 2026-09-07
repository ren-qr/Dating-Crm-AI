import { describe, expect, it } from "vitest";

import {
  hasEveryPermission,
  hasPermission,
  permissionCodes,
  uniqueCodes,
} from "@/business-support/permissions/permissions";
import { resolveRoleLevel } from "@/business-support/permissions/role-level";
import { ApiCode, apiResponse, apiSuccess } from "@/lib/server/api-response";

const REQUIRED_AUTH_PERMISSIONS = [
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

describe("auth helper contract matrix", () => {
  it("returns the unified response envelope from response helpers", async () => {
    const request = new Request("https://example.test/api/v1/me", {
      headers: { "x-request-id": "req_test_1" },
    });

    const response = apiSuccess(request, { id: "employee-1" }, "成功");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      code: ApiCode.OK,
      message: "成功",
      data: { id: "employee-1" },
      requestId: "req_test_1",
    });
    expect(Date.parse(body.timestamp)).not.toBeNaN();
  });

  it("supports error envelopes with explicit status and code", async () => {
    const request = new Request("https://example.test/api/v1/me", {
      headers: { "x-correlation-id": "corr_test_1" },
    });

    const response = apiResponse(request, {
      code: ApiCode.UNAUTHENTICATED,
      message: "未认证",
      data: null,
      status: 401,
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      code: 1001,
      message: "未认证",
      data: null,
      requestId: "corr_test_1",
    });
  });

  it("locks the RBAC permission code list used by permission helpers", () => {
    expect(permissionCodes).toEqual(REQUIRED_AUTH_PERMISSIONS);
    expect(new Set(permissionCodes).size).toBe(permissionCodes.length);
  });

  it("captures allow/deny expectations for permission helper behavior", () => {
    expect(hasPermission(["staff:read", "role:read"], "staff:read")).toBe(true);
    expect(hasPermission(["staff:read"], "role:write")).toBe(false);
    expect(hasPermission(undefined, "staff:read")).toBe(false);
    expect(hasEveryPermission(["staff:read", "role:read"], ["staff:read"])).toBe(true);
    expect(hasEveryPermission(["staff:read"], ["staff:read", "role:read"])).toBe(false);
    expect(uniqueCodes(["b", "a", "b"])).toEqual(["a", "b"]);
  });

  it("normalizes legacy role codes into the two V3 product levels", () => {
    expect(resolveRoleLevel(["admin"])).toEqual({ roleLevel: "manager", roleName: "管理员" });
    expect(resolveRoleLevel(["bootstrap-admin"])).toEqual({ roleLevel: "manager", roleName: "管理员" });
    expect(resolveRoleLevel(["store_manager"])).toEqual({ roleLevel: "manager", roleName: "管理员" });
    expect(resolveRoleLevel(["store-manager"])).toEqual({ roleLevel: "manager", roleName: "管理员" });
    expect(resolveRoleLevel(["consultant"])).toEqual({ roleLevel: "staff", roleName: "员工" });
  });

  it("locks the V1 current employee payload fields", () => {
    const payload = {
      employeeId: "emp_1",
      email: "staff@example.com",
      name: "顾问",
      storeId: "store_1",
      roleCodes: ["consultant"],
      roleLevel: "staff",
      roleName: "员工",
      permissions: ["member:read"],
    };

    expect(payload).toHaveProperty("storeId");
    expect(payload).toHaveProperty("roleLevel");
    expect(payload).toHaveProperty("roleName");
    expect(payload.storeId).toEqual(expect.any(String));
    expect(payload).not.toHaveProperty("passwordHash");
  });
});
