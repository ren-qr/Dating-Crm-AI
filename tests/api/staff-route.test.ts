import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentEmployee: vi.fn(),
  employeeFindUnique: vi.fn(),
  employeeFindMany: vi.fn(),
  employeeFindFirst: vi.fn(),
  employeeCreate: vi.fn(),
  employeeUpdate: vi.fn(),
  employeeDelete: vi.fn(),
  roleFindUnique: vi.fn(),
  roleFindFirst: vi.fn(),
  roleCreate: vi.fn(),
  staffRoleUpdateMany: vi.fn(),
  auditLogCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/business-support/permissions/current-user", () => ({ getCurrentEmployee: mocks.getCurrentEmployee }));
vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    employee: {
      findUnique: mocks.employeeFindUnique,
      findMany: mocks.employeeFindMany,
      findFirst: mocks.employeeFindFirst,
      delete: mocks.employeeDelete,
    },
    role: {
      findUnique: mocks.roleFindUnique,
      findFirst: mocks.roleFindFirst,
      create: mocks.roleCreate,
    },
    auditLog: {
      create: mocks.auditLogCreate,
    },
    $transaction: mocks.transaction,
  },
}));

const staffRoute = await import("@/app/api/v1/staff/route");
const staffDetailRoute = await import("@/app/api/v1/staff/[id]/route");

const manager = {
  employeeId: "emp_manager",
  email: "manager@example.com",
  name: "店长",
  roleCodes: ["store_manager"],
  roleLevel: "manager",
  roleName: "管理员",
  permissions: ["staff:read", "staff:write"],
};

const managerAcrossStores = {
  ...manager,
  employeeId: "emp_owner",
  email: "owner@example.com",
  name: "跨门店管理员",
  roleCodes: ["admin"],
  roleLevel: "manager",
  roleName: "管理员",
};

const staffEmployee = {
  id: "emp_staff",
  storeId: "store_1",
  email: "staff@example.com",
  name: "员工",
  status: "ACTIVE",
  createdAt: new Date("2026-07-11T00:00:00.000Z"),
  updatedAt: new Date("2026-07-11T00:00:00.000Z"),
  roles: [{ role: { code: "consultant" } }],
};

afterEach(() => vi.clearAllMocks());

describe("GET /api/v1/staff", () => {
  it("rejects staff accounts", async () => {
    mocks.getCurrentEmployee.mockResolvedValue({
      ...manager,
      roleCodes: ["consultant"],
      roleLevel: "staff",
      roleName: "员工",
    });

    const response = await staffRoute.GET(new Request("https://example.test/api/v1/staff"));

    expect(response.status).toBe(403);
  });

  it("lets managers list accounts across stores", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(manager);
    mocks.employeeFindUnique.mockResolvedValue({ storeId: "store_1" });
    mocks.employeeFindMany.mockResolvedValue([
      {
        ...staffEmployee,
        id: "emp_manager",
        email: "manager@example.com",
        name: "店长",
        roles: [{ role: { code: "store_manager" } }],
      },
      staffEmployee,
    ]);

    const response = await staffRoute.GET(new Request("https://example.test/api/v1/staff"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items).toHaveLength(2);
    expect(body.data.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "emp_staff", roleLevel: "staff", roleName: "员工" }),
      expect.objectContaining({ id: "emp_manager", roleLevel: "manager", roleName: "管理员" }),
    ]));
  });

  it("lets managers list staff across stores after account transfer", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(managerAcrossStores);
    mocks.employeeFindUnique.mockResolvedValue({ storeId: "store_1" });
    mocks.employeeFindMany.mockResolvedValue([
      {
        ...staffEmployee,
        id: "emp_staff_store_1",
        storeId: "store_1",
      },
      {
        ...staffEmployee,
        id: "emp_staff_store_2",
        storeId: "store_2",
        email: "staff2@example.com",
      },
      {
        ...staffEmployee,
        id: "emp_manager_store_2",
        storeId: "store_2",
        email: "manager2@example.com",
        roles: [{ role: { code: "store_manager" } }],
      },
    ]);

    const response = await staffRoute.GET(new Request("https://example.test/api/v1/staff"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.employeeFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    expect(body.data.storeId).toBeNull();
    expect(body.data.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "emp_staff_store_1", storeId: "store_1" }),
      expect.objectContaining({ id: "emp_staff_store_2", storeId: "store_2" }),
      expect.objectContaining({ id: "emp_manager_store_2", storeId: "store_2", roleLevel: "manager" }),
    ]));
  });
});

describe("POST /api/v1/staff", () => {
  it("rejects managers creating another manager", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(manager);

    const response = await staffRoute.POST(new Request("https://example.test/api/v1/staff", {
      method: "POST",
      body: JSON.stringify({
        email: "new-manager@example.com",
        name: "新店长",
        password: "Demo@123456",
        roleLevel: "manager",
      }),
    }));

    expect(response.status).toBe(403);
    expect(mocks.roleFindUnique).not.toHaveBeenCalled();
  });

  it("creates staff accounts for managers", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(manager);
    mocks.employeeFindUnique
      .mockResolvedValueOnce({ storeId: "store_1" })
      .mockResolvedValueOnce(null);
    mocks.roleFindUnique.mockResolvedValue({ id: "role_staff" });
    mocks.transaction.mockImplementation(async (callback) => callback({
      employee: { create: mocks.employeeCreate },
      auditLog: { create: mocks.auditLogCreate },
    }));
    mocks.employeeCreate.mockResolvedValue(staffEmployee);
    mocks.auditLogCreate.mockResolvedValue({});

    const response = await staffRoute.POST(new Request("https://example.test/api/v1/staff", {
      method: "POST",
      body: JSON.stringify({
        email: "staff@example.com",
        name: "员工",
        password: "Demo@123456",
        roleLevel: "staff",
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.employeeCreate).toHaveBeenCalled();
    expect(mocks.auditLogCreate).toHaveBeenCalled();
    expect(body.data).toMatchObject({ email: "staff@example.com", roleLevel: "staff" });
  });

  it("lets managers create staff accounts in a selected store", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(manager);
    mocks.employeeFindUnique
      .mockResolvedValueOnce({ storeId: "store_1" })
      .mockResolvedValueOnce(null);
    mocks.roleFindUnique.mockResolvedValue({ id: "role_staff_store_1" });
    mocks.transaction.mockImplementation(async (callback) => callback({
      employee: { create: mocks.employeeCreate },
      auditLog: { create: mocks.auditLogCreate },
    }));
    mocks.employeeCreate.mockResolvedValue(staffEmployee);
    mocks.auditLogCreate.mockResolvedValue({});

    const response = await staffRoute.POST(new Request("https://example.test/api/v1/staff", {
      method: "POST",
      body: JSON.stringify({
        email: "p2-created@meetra.local",
        name: "P2新增员工",
        password: "Demo@123456",
        roleLevel: "staff",
        storeId: "store_2",
      }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.roleFindUnique).toHaveBeenCalledWith({ where: { storeId_code: { storeId: "store_2", code: "consultant" } } });
    expect(mocks.employeeCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        storeId: "store_2",
        email: "p2-created@meetra.local",
        roles: { create: { storeId: "store_2", roleId: "role_staff_store_1" } },
      }),
    }));
  });

  it("lets managers create staff accounts in selected stores", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(managerAcrossStores);
    mocks.employeeFindUnique
      .mockResolvedValueOnce({ storeId: "store_1" })
      .mockResolvedValueOnce(null);
    mocks.roleFindUnique.mockResolvedValue({ id: "role_staff_store_2" });
    mocks.transaction.mockImplementation(async (callback) => callback({
      employee: { create: mocks.employeeCreate },
      auditLog: { create: mocks.auditLogCreate },
    }));
    mocks.employeeCreate.mockResolvedValue({ ...staffEmployee, storeId: "store_2", email: "new@meetra.local" });
    mocks.auditLogCreate.mockResolvedValue({});

    const response = await staffRoute.POST(new Request("https://example.test/api/v1/staff", {
      method: "POST",
      body: JSON.stringify({
        email: "new@meetra.local",
        name: "新员工",
        password: "Demo@123456",
        roleLevel: "staff",
        storeId: "store_2",
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.roleFindUnique).toHaveBeenCalledWith({ where: { storeId_code: { storeId: "store_2", code: "consultant" } } });
    expect(mocks.employeeCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        storeId: "store_2",
        email: "new@meetra.local",
        roles: { create: { storeId: "store_2", roleId: "role_staff_store_2" } },
      }),
    }));
    expect(body.data).toMatchObject({ email: "new@meetra.local", storeId: "store_2" });
  });
});

describe("PATCH /api/v1/staff/{id}", () => {
  it("does not allow managers to disable another manager", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(managerAcrossStores);
    mocks.employeeFindUnique.mockResolvedValue({ storeId: "store_1" });
    mocks.employeeFindFirst.mockResolvedValue({
      ...staffEmployee,
      id: "emp_manager_2",
      email: "manager2@example.com",
      name: "二店长",
      roles: [{ role: { code: "store_manager" } }],
    });
    mocks.transaction.mockImplementation(async (callback) => callback({
      employee: { update: mocks.employeeUpdate },
      staffRole: { deleteMany: vi.fn(), create: vi.fn(), updateMany: mocks.staffRoleUpdateMany },
      auditLog: { create: mocks.auditLogCreate },
    }));
    mocks.employeeUpdate.mockResolvedValue({
      ...staffEmployee,
      id: "emp_manager_2",
      email: "manager2@example.com",
      name: "二店长",
      status: "DISABLED",
      roles: [{ role: { code: "store_manager" } }],
    });
    mocks.auditLogCreate.mockResolvedValue({});

    const response = await staffDetailRoute.PATCH(new Request("https://example.test/api/v1/staff/emp_manager_2", {
      method: "PATCH",
      body: JSON.stringify({ status: "DISABLED" }),
    }), { params: Promise.resolve({ id: "emp_manager_2" }) });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({ code: 1002, message: "无权调整该账号" });
  });

  it("does not allow managers to appoint another manager", async () => {
    const staffRoleDeleteMany = vi.fn();
    const staffRoleCreate = vi.fn();
    mocks.getCurrentEmployee.mockResolvedValue(managerAcrossStores);
    mocks.employeeFindUnique.mockResolvedValue({ storeId: "store_1" });
    mocks.employeeFindFirst.mockResolvedValue(staffEmployee);
    mocks.roleFindUnique.mockResolvedValue({ id: "role_manager" });
    mocks.transaction.mockImplementation(async (callback) => callback({
      employee: { update: mocks.employeeUpdate },
      staffRole: { deleteMany: staffRoleDeleteMany, create: staffRoleCreate, updateMany: mocks.staffRoleUpdateMany },
      auditLog: { create: mocks.auditLogCreate },
    }));
    mocks.employeeUpdate.mockResolvedValue({
      ...staffEmployee,
      roles: [{ role: { code: "store_manager" } }],
    });
    mocks.auditLogCreate.mockResolvedValue({});

    const response = await staffDetailRoute.PATCH(new Request("https://example.test/api/v1/staff/emp_staff", {
      method: "PATCH",
      body: JSON.stringify({ roleLevel: "manager" }),
    }), { params: Promise.resolve({ id: "emp_staff" }) });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({ code: 1002, message: "无权任命该职级" });
    expect(staffRoleDeleteMany).not.toHaveBeenCalled();
    expect(staffRoleCreate).not.toHaveBeenCalled();
  });

  it("syncs role assignment store when managers move staff accounts", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(managerAcrossStores);
    mocks.employeeFindUnique.mockResolvedValue({ storeId: "store_1" });
    mocks.employeeFindFirst.mockResolvedValue(staffEmployee);
    mocks.transaction.mockImplementation(async (callback) => callback({
      employee: { update: mocks.employeeUpdate },
      staffRole: { deleteMany: vi.fn(), create: vi.fn(), updateMany: mocks.staffRoleUpdateMany },
      auditLog: { create: mocks.auditLogCreate },
    }));
    mocks.employeeUpdate.mockResolvedValue({
      ...staffEmployee,
      storeId: "store_2",
    });
    mocks.staffRoleUpdateMany.mockResolvedValue({ count: 1 });
    mocks.auditLogCreate.mockResolvedValue({});

    const response = await staffDetailRoute.PATCH(new Request("https://example.test/api/v1/staff/emp_staff", {
      method: "PATCH",
      body: JSON.stringify({ storeId: "store_2" }),
    }), { params: Promise.resolve({ id: "emp_staff" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.staffRoleUpdateMany).toHaveBeenCalledWith({ where: { employeeId: "emp_staff" }, data: { storeId: "store_2" } });
    expect(body.data).toMatchObject({ id: "emp_staff", storeId: "store_2", roleLevel: "staff" });
  });
});

describe("DELETE /api/v1/staff/{id}", () => {
  it("blocks P1 from deleting staff accounts", async () => {
    mocks.getCurrentEmployee.mockResolvedValue({
      ...staffEmployee,
      employeeId: "emp_staff",
      roleLevel: "staff",
      roleCodes: ["consultant"],
      permissions: ["staff:write"],
    });

    const response = await staffDetailRoute.DELETE(new Request("https://example.test/api/v1/staff/emp_other", {
      method: "DELETE",
    }), { params: Promise.resolve({ id: "emp_other" }) });

    expect(response.status).toBe(403);
    expect(mocks.employeeFindFirst).not.toHaveBeenCalled();
  });

  it("deletes unmanaged staff accounts for managers", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(manager);
    mocks.employeeFindUnique.mockResolvedValue({ storeId: "store_1" });
    mocks.employeeFindFirst.mockResolvedValue({
      ...staffEmployee,
      _count: {
        ownedMembers: 0,
        followUps: 0,
        assignedCustomers: 0,
        createdMatches: 0,
        createdBlacklistEntries: 0,
      },
    });
    mocks.transaction.mockImplementation(async (callback) => callback({
      employee: { delete: mocks.employeeDelete },
      auditLog: { create: mocks.auditLogCreate },
    }));
    mocks.employeeDelete.mockResolvedValue(staffEmployee);
    mocks.auditLogCreate.mockResolvedValue({});

    const response = await staffDetailRoute.DELETE(new Request("https://example.test/api/v1/staff/emp_staff", {
      method: "DELETE",
    }), { params: Promise.resolve({ id: "emp_staff" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.employeeDelete).toHaveBeenCalledWith({ where: { id: "emp_staff" } });
    expect(mocks.auditLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "DELETE",
        resourceType: "Employee",
        resourceId: "emp_staff",
      }),
    }));
    expect(body.data).toEqual({ id: "emp_staff" });
  });

  it("blocks deleting staff with assigned members", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(manager);
    mocks.employeeFindUnique.mockResolvedValue({ storeId: "store_1" });
    mocks.employeeFindFirst.mockResolvedValue({
      ...staffEmployee,
      _count: {
        ownedMembers: 1,
        followUps: 0,
        assignedCustomers: 0,
        createdMatches: 0,
        createdBlacklistEntries: 0,
      },
    });

    const response = await staffDetailRoute.DELETE(new Request("https://example.test/api/v1/staff/emp_staff", {
      method: "DELETE",
    }), { params: Promise.resolve({ id: "emp_staff" }) });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({ code: 1004, message: "员工仍有关联业务数据，请先转移会员或停用账号" });
    expect(mocks.employeeDelete).not.toHaveBeenCalled();
  });
});
