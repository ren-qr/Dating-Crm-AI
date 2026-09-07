import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentEmployee: vi.fn(),
  employeeFindUnique: vi.fn(),
  memberCount: vi.fn(),
  followUpCount: vi.fn(),
  blacklistCount: vi.fn(),
  auditFindMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/business-support/permissions/current-user", () => ({
  getCurrentEmployee: mocks.getCurrentEmployee,
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    employee: { findUnique: mocks.employeeFindUnique },
    member: { count: mocks.memberCount },
    followUpRecord: { count: mocks.followUpCount },
    blacklistEntry: { count: mocks.blacklistCount },
    auditLog: { findMany: mocks.auditFindMany },
    $transaction: mocks.transaction,
  },
}));

const { GET } = await import("@/app/api/v1/dashboard/overview/route");

const employee = {
  employeeId: "emp_1",
  email: "staff@example.com",
  name: "Staff",
  roleCodes: ["operator"],
  permissions: ["member:read"],
};

afterEach(() => vi.clearAllMocks());

describe("GET /api/v1/dashboard/overview", () => {
  it("returns 1001 when unauthenticated", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(null);

    const response = await GET(new Request("https://example.test/api/v1/dashboard/overview"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: 1001, data: null });
  });

  it("returns 1002 without member read permission", async () => {
    mocks.getCurrentEmployee.mockResolvedValue({ ...employee, permissions: [] });

    const response = await GET(new Request("https://example.test/api/v1/dashboard/overview"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 1002, data: null });
  });

  it("returns aggregate data scoped to the current employee store", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(employee);
    mocks.employeeFindUnique.mockResolvedValue({ storeId: "store_1" });
    mocks.memberCount.mockResolvedValueOnce(14).mockResolvedValueOnce(2).mockResolvedValueOnce(4);
    mocks.followUpCount.mockResolvedValue(3);
    mocks.blacklistCount.mockResolvedValue(1);
    mocks.auditFindMany.mockResolvedValue([
      {
        id: "audit_1",
        action: "CREATE",
        resourceType: "Member",
        createdAt: new Date("2026-07-11T02:00:00.000Z"),
        actorEmployee: { name: "运营一号" },
      },
    ]);
    mocks.transaction.mockImplementation(async (operations) => Promise.all(operations));

    const response = await GET(new Request("https://example.test/api/v1/dashboard/overview"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.memberCount).toHaveBeenNthCalledWith(1, { where: { storeId: "store_1", ownerEmployeeId: "emp_1" } });
    expect(mocks.followUpCount).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: "store_1", employeeId: "emp_1", nextAt: expect.any(Object) }),
    }));
    expect(mocks.blacklistCount).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: "store_1", status: "ACTIVE" }),
    }));
    expect(mocks.auditFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId: "store_1" },
      include: expect.objectContaining({ actorEmployee: { select: { name: true } } }),
      take: 8,
    }));
    expect(body.data).toEqual({
      memberTotal: 14,
      newMembersToday: 2,
      followupsDueToday: 3,
      profileIncomplete: 4,
      activeBlacklistCount: 1,
      recentAudits: [{
        id: "audit_1",
        action: "CREATE",
        resourceType: "Member",
        createdAt: "2026-07-11T02:00:00.000Z",
        actorName: "运营一号",
      }],
    });
  });
});
