import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentEmployee: vi.fn(),
  employeeFindUnique: vi.fn(),
  blacklistFindMany: vi.fn(),
  blacklistCount: vi.fn(),
  blacklistCreate: vi.fn(),
  memberFindFirst: vi.fn(),
  memberUpdate: vi.fn(),
  auditLogCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/business-support/permissions/current-user", () => ({
  getCurrentEmployee: mocks.getCurrentEmployee,
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    employee: { findUnique: mocks.employeeFindUnique },
    member: {
      findFirst: mocks.memberFindFirst,
      update: mocks.memberUpdate,
    },
    blacklistEntry: {
      findMany: mocks.blacklistFindMany,
      count: mocks.blacklistCount,
      create: mocks.blacklistCreate,
    },
    auditLog: { create: mocks.auditLogCreate },
    $transaction: mocks.transaction,
  },
}));

const { GET, POST } = await import("@/app/api/v1/blacklists/route");

const employee = {
  employeeId: "emp_1",
  email: "staff@example.com",
  name: "Staff",
  roleCodes: ["operator"],
  permissions: ["blacklist:read", "blacklist:write"],
};

afterEach(() => vi.clearAllMocks());

describe("GET /api/v1/blacklists", () => {
  it("returns 1001 when unauthenticated", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(null);

    const response = await GET(new Request("https://example.test/api/v1/blacklists"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: 1001, message: "未认证", data: null });
  });

  it("returns 1002 without blacklist read permission", async () => {
    mocks.getCurrentEmployee.mockResolvedValue({ ...employee, permissions: ["blacklist:write"] });

    const response = await GET(new Request("https://example.test/api/v1/blacklists"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 1002, message: "无权限", data: null });
  });

  it("returns 1000 for invalid query parameters", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(employee);

    const response = await GET(new Request("https://example.test/api/v1/blacklists?page=0&severity=BAD"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 1000, message: "参数错误", data: null });
    expect(mocks.employeeFindUnique).not.toHaveBeenCalled();
  });

  it("returns paginated blacklists scoped to the current employee store", async () => {
    const createdAt = new Date("2026-07-11T01:00:00.000Z");
    const updatedAt = new Date("2026-07-11T02:00:00.000Z");
    mocks.getCurrentEmployee.mockResolvedValue(employee);
    mocks.employeeFindUnique.mockResolvedValue({ storeId: "store_1" });
    mocks.blacklistFindMany.mockResolvedValue([
      {
        id: "blacklist_1",
        storeId: "store_1",
        memberId: "member_1",
        phoneHash: "hash_phone",
        idCardHash: null,
        reason: "投诉欺诈",
        severity: "HIGH",
        status: "ACTIVE",
        createdById: "emp_1",
        resolvedAt: null,
        expiresAt: null,
        createdAt,
        updatedAt,
      },
    ]);
    mocks.blacklistCount.mockResolvedValue(1);
    mocks.transaction.mockImplementation(async (operations) => Promise.all(operations));

    const response = await GET(
      new Request("https://example.test/api/v1/blacklists?page=1&pageSize=20&status=ACTIVE&severity=HIGH&memberId=member_1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.blacklistFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId: "store_1", status: "ACTIVE", severity: "HIGH", memberId: "member_1" },
      skip: 0,
      take: 20,
    }));
    expect(body.data).toMatchObject({
      items: [{ id: "blacklist_1", hasPhoneHash: true, hasIdCardHash: false }],
      total: 1,
      hasNext: false,
    });
  });
});

describe("POST /api/v1/blacklists", () => {
  it("returns 1002 without blacklist write permission", async () => {
    mocks.getCurrentEmployee.mockResolvedValue({ ...employee, permissions: ["blacklist:read"] });

    const response = await POST(new Request("https://example.test/api/v1/blacklists", { method: "POST", body: "{}" }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 1002, data: null });
  });

  it("returns 1000 for invalid body without audit log", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(employee);

    const response = await POST(
      new Request("https://example.test/api/v1/blacklists", {
        method: "POST",
        body: JSON.stringify({ reason: "缺少命中对象" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 1000, message: "参数错误", data: null });
    expect(mocks.auditLogCreate).not.toHaveBeenCalled();
  });

  it("creates blacklist entry, updates member status, and writes audit log", async () => {
    const createdAt = new Date("2026-07-11T03:00:00.000Z");
    const updatedAt = new Date("2026-07-11T03:00:00.000Z");
    mocks.getCurrentEmployee.mockResolvedValue(employee);
    mocks.employeeFindUnique.mockResolvedValue({ storeId: "store_1" });
    mocks.memberFindFirst.mockResolvedValue({ id: "member_1" });
    mocks.blacklistCreate.mockResolvedValue({
      id: "blacklist_1",
      storeId: "store_1",
      memberId: "member_1",
      phoneHash: "hash_phone",
      idCardHash: null,
      reason: "投诉欺诈",
      severity: "HIGH",
      status: "ACTIVE",
      createdById: "emp_1",
      resolvedAt: null,
      expiresAt: null,
      createdAt,
      updatedAt,
    });
    mocks.auditLogCreate.mockResolvedValue({ id: "audit_1" });
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        blacklistEntry: { create: mocks.blacklistCreate },
        member: { update: mocks.memberUpdate },
        auditLog: { create: mocks.auditLogCreate },
      }),
    );

    const response = await POST(
      new Request("https://example.test/api/v1/blacklists", {
        method: "POST",
        headers: { "x-request-id": "req_blacklist_create" },
        body: JSON.stringify({
          storeId: "store_1",
          memberId: "member_1",
          phone: "13800138000",
          reason: "投诉欺诈",
          severity: "HIGH",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.memberUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "member_1" },
      data: expect.objectContaining({ status: "BLACKLISTED", updatedById: "emp_1" }),
    }));
    expect(mocks.auditLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "CREATE",
        resourceType: "BlacklistEntry",
        resourceId: "blacklist_1",
        requestId: "req_blacklist_create",
      }),
    }));
    expect(body).toMatchObject({ code: 0, message: "创建成功", data: { id: "blacklist_1", hasPhoneHash: true } });
  });
});
