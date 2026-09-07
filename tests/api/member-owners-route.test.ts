import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentEmployee: vi.fn(),
  employeeFindUnique: vi.fn(),
  employeeFindMany: vi.fn(),
}));

vi.mock("@/business-support/permissions/current-user", () => ({ getCurrentEmployee: mocks.getCurrentEmployee }));
vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    employee: {
      findUnique: mocks.employeeFindUnique,
      findMany: mocks.employeeFindMany,
    },
  },
}));

const { GET } = await import("@/app/api/v1/members/owners/route");

const writer = {
  employeeId: "emp_1",
  email: "writer@example.com",
  name: "运营",
  roleCodes: ["store_manager"],
  roleLevel: "manager",
  roleName: "管理员",
  storeId: "store_1",
  permissions: ["member:write"],
};

afterEach(() => vi.clearAllMocks());

describe("GET /api/v1/members/owners", () => {
  it("requires authenticated member write permission", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(null);
    const response = await GET(new Request("https://example.test/api/v1/members/owners"));
    expect(response.status).toBe(401);

    mocks.getCurrentEmployee.mockResolvedValue({ ...writer, permissions: ["member:read"] });
    const forbidden = await GET(new Request("https://example.test/api/v1/members/owners"));
    expect(forbidden.status).toBe(403);
  });

  it("returns only active same-store owners without private fields", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(writer);
    mocks.employeeFindUnique.mockResolvedValue({ storeId: "store_1" });
    mocks.employeeFindMany.mockResolvedValue([
      { id: "emp_1", name: "运营", roles: [{ role: { code: "store_manager" } }] },
      { id: "emp_2", name: "顾问", roles: [{ role: { code: "consultant" } }] },
    ]);

    const response = await GET(new Request("https://example.test/api/v1/members/owners"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.employeeFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId: "store_1", status: "ACTIVE" },
    }));
    expect(body.data).toEqual({
      storeId: "store_1",
      items: [
        { id: "emp_1", name: "运营", roleCodes: ["store_manager"], roleLevel: "manager", roleName: "管理员" },
        { id: "emp_2", name: "顾问", roleCodes: ["consultant"], roleLevel: "staff", roleName: "员工" },
      ],
    });
    expect(JSON.stringify(body.data)).not.toContain("email");
    expect(JSON.stringify(body.data)).not.toContain("password");
  });

  it("returns candidates from a requested store for member assignment", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(writer);
    mocks.employeeFindUnique.mockResolvedValue({ storeId: "store_1" });

    const response = await GET(new Request("https://example.test/api/v1/members/owners?storeId=store_2"));

    expect(response.status).toBe(200);
    expect(mocks.employeeFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId: "store_2", status: "ACTIVE" },
    }));
  });

  it("returns assignable employees to staff accounts", async () => {
    mocks.getCurrentEmployee.mockResolvedValue({
      ...writer,
      roleCodes: ["consultant"],
      roleLevel: "staff",
      roleName: "P1",
    });
    mocks.employeeFindUnique.mockResolvedValue({ storeId: "store_1" });
    mocks.employeeFindMany.mockResolvedValue([
      { id: "emp_1", name: "运营", roles: [{ role: { code: "consultant" } }] },
      { id: "emp_2", name: "顾问", roles: [{ role: { code: "consultant" } }] },
    ]);

    const response = await GET(new Request("https://example.test/api/v1/members/owners"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.employeeFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId: "store_1", status: "ACTIVE" },
    }));
    expect(body.data).toEqual({
      storeId: "store_1",
      items: [
        { id: "emp_1", name: "运营", roleCodes: ["consultant"], roleLevel: "staff", roleName: "员工" },
        { id: "emp_2", name: "顾问", roleCodes: ["consultant"], roleLevel: "staff", roleName: "员工" },
      ],
    });
  });
});
