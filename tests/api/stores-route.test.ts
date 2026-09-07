import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentEmployee: vi.fn(),
  storeFindMany: vi.fn(),
  storeFindUnique: vi.fn(),
  storeCreate: vi.fn(),
  storeUpdate: vi.fn(),
  storeDelete: vi.fn(),
  roleFindMany: vi.fn(),
  roleCreate: vi.fn(),
  employeeCount: vi.fn(),
  memberCount: vi.fn(),
  auditLogCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/business-support/permissions/current-user", () => ({ getCurrentEmployee: mocks.getCurrentEmployee }));
vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    store: {
      findMany: mocks.storeFindMany,
      findUnique: mocks.storeFindUnique,
    },
    employee: { count: mocks.employeeCount },
    member: { count: mocks.memberCount },
    role: {
      findMany: mocks.roleFindMany,
      create: mocks.roleCreate,
    },
    auditLog: { create: mocks.auditLogCreate },
    $transaction: mocks.transaction,
  },
}));

const storesRoute = await import("@/app/api/v1/stores/route");
const storeDetailRoute = await import("@/app/api/v1/stores/[id]/route");

const manager = {
  employeeId: "emp_owner",
  email: "owner@example.com",
  name: "管理员账号",
  storeId: "store_1",
  roleCodes: ["admin"],
  roleLevel: "manager",
  roleName: "管理员",
  permissions: ["role:write"],
};


const store = {
  id: "store_1",
  name: "人民广场店",
  address: "上海市黄浦区",
  phone: "021-00000000",
  status: "ACTIVE",
  createdAt: new Date("2026-07-11T00:00:00.000Z"),
  updatedAt: new Date("2026-07-11T00:00:00.000Z"),
};

afterEach(() => vi.clearAllMocks());

describe("GET /api/v1/stores", () => {
  it("lets managers read store names for filters and display", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(manager);
    mocks.storeFindMany.mockResolvedValue([store]);
    mocks.employeeCount.mockResolvedValue(2);
    mocks.memberCount.mockResolvedValue(8);

    const response = await storesRoute.GET(new Request("https://example.test/api/v1/stores"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items[0]).toMatchObject({ id: "store_1", name: "人民广场店" });
  });

  it("lists stores with employee and member counts for managers", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(manager);
    mocks.storeFindMany.mockResolvedValue([store]);
    mocks.employeeCount.mockResolvedValue(2);
    mocks.memberCount.mockResolvedValue(8);

    const response = await storesRoute.GET(new Request("https://example.test/api/v1/stores"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items[0]).toMatchObject({ id: "store_1", name: "人民广场店", employeeCount: 2, memberCount: 8 });
  });
});

describe("POST /api/v1/stores", () => {
  it("creates stores for managers", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(manager);
    mocks.storeFindUnique.mockResolvedValue(null);
    mocks.transaction.mockImplementation(async (callback) => callback({
      store: { create: mocks.storeCreate },
      role: { findMany: mocks.roleFindMany, create: mocks.roleCreate },
      auditLog: { create: mocks.auditLogCreate },
    }));
    mocks.storeCreate.mockResolvedValue({ ...store, id: "store_2", name: "静安店" });
    mocks.roleFindMany.mockResolvedValue([
      { code: "consultant", name: "P1", description: "基础职级", permissions: [{ code: "member:read" }] },
    ]);
    mocks.roleCreate.mockResolvedValue({});
    mocks.auditLogCreate.mockResolvedValue({});

    const response = await storesRoute.POST(new Request("https://example.test/api/v1/stores", {
      method: "POST",
      body: JSON.stringify({ id: "store_2", name: "静安店", address: "南京西路", phone: "021-12345678" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.storeCreate).toHaveBeenCalled();
    expect(mocks.roleCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ storeId: "store_2", code: "consultant" }),
    }));
    expect(body.data).toMatchObject({ id: "store_2", name: "静安店" });
  });
});

describe("PATCH /api/v1/stores/{id}", () => {
  it("updates store information for managers", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(manager);
    mocks.storeFindUnique.mockResolvedValue(store);
    mocks.transaction.mockImplementation(async (callback) => callback({
      store: { update: mocks.storeUpdate },
      auditLog: { create: mocks.auditLogCreate },
    }));
    mocks.storeUpdate.mockResolvedValue({ ...store, name: "人民广场旗舰店" });
    mocks.employeeCount.mockResolvedValue(2);
    mocks.memberCount.mockResolvedValue(8);
    mocks.auditLogCreate.mockResolvedValue({});

    const response = await storeDetailRoute.PATCH(new Request("https://example.test/api/v1/stores/store_1", {
      method: "PATCH",
      body: JSON.stringify({ name: "人民广场旗舰店" }),
    }), { params: Promise.resolve({ id: "store_1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.storeUpdate).toHaveBeenCalledWith({ where: { id: "store_1" }, data: { name: "人民广场旗舰店" } });
    expect(body.data).toMatchObject({ id: "store_1", name: "人民广场旗舰店" });
  });
});

describe("DELETE /api/v1/stores/{id}", () => {
  it("blocks deleting stores that still have employees or members", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(manager);
    mocks.storeFindUnique.mockResolvedValue(store);
    mocks.employeeCount.mockResolvedValue(1);
    mocks.memberCount.mockResolvedValue(0);

    const response = await storeDetailRoute.DELETE(new Request("https://example.test/api/v1/stores/store_1", {
      method: "DELETE",
    }), { params: Promise.resolve({ id: "store_1" }) });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.message).toBe("门店已有员工或会员，不能删除");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("deletes empty stores for managers", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(manager);
    mocks.storeFindUnique.mockResolvedValue(store);
    mocks.employeeCount.mockResolvedValue(0);
    mocks.memberCount.mockResolvedValue(0);
    mocks.transaction.mockImplementation(async (callback) => callback({
      store: { delete: mocks.storeDelete },
      auditLog: { create: mocks.auditLogCreate },
    }));
    mocks.storeDelete.mockResolvedValue(store);
    mocks.auditLogCreate.mockResolvedValue({});

    const response = await storeDetailRoute.DELETE(new Request("https://example.test/api/v1/stores/store_1", {
      method: "DELETE",
    }), { params: Promise.resolve({ id: "store_1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.storeDelete).toHaveBeenCalledWith({ where: { id: "store_1" } });
    expect(body.data).toEqual({ id: "store_1" });
  });
});
