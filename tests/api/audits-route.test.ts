import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentEmployee: vi.fn(),
  employeeFindUnique: vi.fn(),
  auditFindMany: vi.fn(),
  auditCount: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/business-support/permissions/current-user", () => ({
  getCurrentEmployee: mocks.getCurrentEmployee,
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    employee: { findUnique: mocks.employeeFindUnique },
    auditLog: {
      findMany: mocks.auditFindMany,
      count: mocks.auditCount,
    },
    $transaction: mocks.transaction,
  },
}));

const { GET } = await import("@/app/api/v1/audits/route");

const employee = {
  employeeId: "emp_1",
  email: "staff@example.com",
  name: "Staff",
  roleCodes: ["operator"],
  permissions: ["audit:read"],
};

afterEach(() => vi.clearAllMocks());

describe("GET /api/v1/audits", () => {
  it("returns 1001 when unauthenticated", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(null);

    const response = await GET(new Request("https://example.test/api/v1/audits"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: 1001, message: "未认证", data: null });
  });

  it("returns 1002 without audit read permission", async () => {
    mocks.getCurrentEmployee.mockResolvedValue({ ...employee, permissions: [] });

    const response = await GET(new Request("https://example.test/api/v1/audits"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 1002, message: "无权限", data: null });
  });

  it("returns 1000 for invalid filters", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(employee);

    const response = await GET(new Request("https://example.test/api/v1/audits?action=BAD&pageSize=101"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 1000, message: "参数错误", data: null });
    expect(mocks.employeeFindUnique).not.toHaveBeenCalled();
  });

  it("returns paginated audit logs scoped to current employee store with filters", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(employee);
    mocks.employeeFindUnique.mockResolvedValue({ storeId: "store_1" });
    mocks.auditFindMany.mockResolvedValue([
      {
        id: "audit_1",
        storeId: "store_1",
        actorEmployeeId: "emp_2",
        actorEmployee: { id: "emp_2", name: "运营一号", email: "op@example.com" },
        action: "BLACKLIST_BLOCK",
        resourceType: "FollowUpRecord",
        resourceId: "member_1",
        requestId: "req_1",
        beforeHash: null,
        afterHash: null,
        metadataJson: { operation: "followup.create" },
        ipHash: "ip_hash",
        userAgentHash: "ua_hash",
        createdAt: new Date("2026-07-11T05:00:00.000Z"),
      },
    ]);
    mocks.auditCount.mockResolvedValue(1);
    mocks.transaction.mockImplementation(async (operations) => Promise.all(operations));

    const response = await GET(
      new Request(
        "https://example.test/api/v1/audits?page=1&pageSize=10&action=BLACKLIST_BLOCK&resourceType=FollowUpRecord&requestId=req_1&dateFrom=2026-07-11T00:00:00.000%2B08:00&dateTo=2026-07-12T00:00:00.000%2B08:00",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.auditFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        storeId: "store_1",
        action: "BLACKLIST_BLOCK",
        resourceType: "FollowUpRecord",
        requestId: "req_1",
        createdAt: expect.objectContaining({ gte: expect.any(Date), lte: expect.any(Date) }),
      }),
      include: { actorEmployee: { select: { id: true, name: true, email: true } } },
      skip: 0,
      take: 10,
    }));
    expect(body.data).toMatchObject({
      items: [{
        id: "audit_1",
        actorName: "运营一号",
        actor: { id: "emp_2", name: "运营一号", email: "op@example.com" },
        action: "BLACKLIST_BLOCK",
        metadataJson: { operation: "followup.create" },
      }],
      total: 1,
      hasNext: false,
    });
  });
});
