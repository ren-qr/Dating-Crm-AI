import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentEmployee: vi.fn(),
  employeeFindUnique: vi.fn(),
  storeFindUnique: vi.fn(),
}));

vi.mock("@/business-support/permissions/current-user", () => ({
  getCurrentEmployee: mocks.getCurrentEmployee,
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    employee: { findUnique: mocks.employeeFindUnique },
    store: { findUnique: mocks.storeFindUnique },
  },
}));

const { GET } = await import("@/app/api/v1/me/route");

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/me", () => {
  it("returns 1001 when the request is unauthenticated", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(null);

    const response = await GET(
      new Request("https://example.test/api/v1/me", {
        headers: { "x-request-id": "req_me_unauthenticated" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      code: 1001,
      message: "未认证",
      data: null,
      requestId: "req_me_unauthenticated",
    });
    expect(Date.parse(body.timestamp)).not.toBeNaN();
  });

  it("returns sanitized current employee identity, roles, and permissions", async () => {
    mocks.getCurrentEmployee.mockResolvedValue({
      employeeId: "emp_1",
      email: "staff@example.com",
      name: "Staff User",
      roleCodes: ["consultant"],
      roleLevel: "staff",
      roleName: "P1",
      permissions: ["staff:read", "audit:read"],
    });
    mocks.employeeFindUnique.mockResolvedValue({ storeId: "store_1" });
    mocks.storeFindUnique.mockResolvedValue({ name: "新创门店" });

    const response = await GET(
      new Request("https://example.test/api/v1/me", {
        headers: { "x-request-id": "req_me_success" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      code: 0,
      message: "success",
      data: {
        employeeId: "emp_1",
        email: "staff@example.com",
        name: "Staff User",
        storeId: "store_1",
        storeName: "新创门店",
        roleCodes: ["consultant"],
        roleLevel: "staff",
        roleName: "P1",
        permissions: ["staff:read", "audit:read"],
      },
      requestId: "req_me_success",
    });
    expect(body.data).not.toHaveProperty("password");
    expect(body.data).not.toHaveProperty("passwordHash");
    expect(body.data).not.toHaveProperty("token");
  });

  it("returns null storeId when the signed-in employee is no longer persisted", async () => {
    mocks.getCurrentEmployee.mockResolvedValue({
      employeeId: "emp_missing",
      email: "staff@example.com",
      name: "Staff User",
      roleCodes: ["consultant"],
      roleLevel: "staff",
      roleName: "P1",
      permissions: [],
    });
    mocks.employeeFindUnique.mockResolvedValue(null);
    mocks.storeFindUnique.mockResolvedValue(null);

    const response = await GET(new Request("https://example.test/api/v1/me"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.storeId).toBeNull();
    expect(body.data.storeName).toBeNull();
    expect(mocks.storeFindUnique).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "P3",
      employee: {
        employeeId: "emp_owner",
        email: "owner@example.com",
        name: "P3账号",
        roleCodes: ["owner"],
        permissions: ["member:read", "member:write", "staff:read", "staff:write", "role:write", "export:write"],
      },
      storeId: "store_headquarters",
    },
    {
      label: "P2",
      employee: {
        employeeId: "emp_manager",
        email: "manager@example.com",
        name: "P2账号",
        roleCodes: ["store-manager"],
        permissions: ["member:read", "member:write", "staff:read", "customer:assign", "audit:read"],
      },
      storeId: "store_1",
    },
    {
      label: "员工",
      employee: {
        employeeId: "emp_staff",
        email: "staff@example.com",
        name: "员工",
        roleCodes: ["staff"],
        permissions: ["member:read", "member:write", "followup:write"],
      },
      storeId: "store_1",
    },
  ])("returns V1 three-level role identity for $label without sensitive fields", async ({ label, employee, storeId }) => {
    mocks.getCurrentEmployee.mockResolvedValue(employee);
    mocks.employeeFindUnique.mockResolvedValue({ storeId });
    mocks.storeFindUnique.mockResolvedValue({ name: `${label}门店` });

    const response = await GET(new Request("https://example.test/api/v1/me"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      employeeId: employee.employeeId,
      email: employee.email,
      name: employee.name,
      storeId,
      storeName: `${label}门店`,
      roleCodes: employee.roleCodes,
      permissions: employee.permissions,
    });
    expect(JSON.stringify(body.data)).not.toContain("password");
    expect(JSON.stringify(body.data)).not.toContain("token");
  });
});
