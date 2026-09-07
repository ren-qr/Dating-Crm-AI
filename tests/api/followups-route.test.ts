import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentEmployee: vi.fn(), employeeFindUnique: vi.fn(), memberFindFirst: vi.fn(), matchFindFirst: vi.fn(), blacklistFindFirst: vi.fn(), followUpCreate: vi.fn(), auditLogCreate: vi.fn(), transaction: vi.fn(),
}));

vi.mock("@/business-support/permissions/current-user", () => ({ getCurrentEmployee: mocks.getCurrentEmployee }));
vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    employee: { findUnique: mocks.employeeFindUnique },
    member: { findFirst: mocks.memberFindFirst },
    matchRecord: { findFirst: mocks.matchFindFirst },
    blacklistEntry: { findFirst: mocks.blacklistFindFirst },
    followUpRecord: { create: mocks.followUpCreate },
    auditLog: { create: mocks.auditLogCreate },
    $transaction: mocks.transaction,
  },
}));

const { POST } = await import("@/app/api/v1/followups/route");
const employee = { employeeId: "emp_1", storeId: "store_1", email: "staff@example.com", name: "顾问", roleCodes: ["consultant"], roleLevel: "staff" as const, roleName: "员工", permissions: ["followup:write"] };

afterEach(() => vi.clearAllMocks());

describe("POST /api/v1/followups", () => {
  it("requires an authenticated followup writer", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(null);
    expect((await POST(new Request("https://example.test/api/v1/followups", { method: "POST" }))).status).toBe(401);
    mocks.getCurrentEmployee.mockResolvedValue({ ...employee, permissions: [] });
    expect((await POST(new Request("https://example.test/api/v1/followups", { method: "POST", body: "{}" }))).status).toBe(403);
  });

  it("does not query the database for an invalid body", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(employee);
    const response = await POST(new Request("https://example.test/api/v1/followups", { method: "POST", body: JSON.stringify({ memberId: "member_1", content: "已沟通" }) }));
    expect(response.status).toBe(400);
    expect(mocks.employeeFindUnique).not.toHaveBeenCalled();
  });

  it("limits a consultant to their own member before attempting a followup", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(employee);
    mocks.employeeFindUnique.mockResolvedValue({ storeId: "store_1" });
    mocks.memberFindFirst.mockResolvedValue(null);
    const response = await POST(new Request("https://example.test/api/v1/followups", { method: "POST", body: JSON.stringify({ storeId: "store_1", memberId: "member_other", type: "CALL", content: "尝试回访" }) }));
    expect(response.status).toBe(404);
    expect(mocks.memberFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "member_other", storeId: "store_1", ownerEmployeeId: "emp_1" } }));
  });

  it("blocks a followup when the member has an active blacklist entry", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(employee);
    mocks.employeeFindUnique.mockResolvedValue({ storeId: "store_1" });
    mocks.memberFindFirst.mockResolvedValue({ id: "member_1" });
    mocks.blacklistFindFirst.mockResolvedValue({ id: "blacklist_1", severity: "CRITICAL" });
    const response = await POST(new Request("https://example.test/api/v1/followups", { method: "POST", body: JSON.stringify({ storeId: "store_1", memberId: "member_1", type: "CALL", content: "尝试回访" }) }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: 1005, data: { blacklistEntryId: "blacklist_1" } });
    expect(mocks.followUpCreate).not.toHaveBeenCalled();
  });

  it("creates the V3.1 followup record and audit event", async () => {
    const createdAt = new Date("2026-09-07T04:00:00.000Z");
    mocks.getCurrentEmployee.mockResolvedValue(employee);
    mocks.employeeFindUnique.mockResolvedValue({ storeId: "store_1" });
    mocks.memberFindFirst.mockResolvedValue({ id: "member_1" });
    mocks.blacklistFindFirst.mockResolvedValue(null);
    mocks.followUpCreate.mockResolvedValue({ id: "followup_1", memberId: "member_1", type: "CALL", content: "反馈不错", nextAction: "明日回访", nextAt: new Date("2026-09-08T10:00:00.000Z"), createdAt, employee: { name: "顾问" } });
    mocks.auditLogCreate.mockResolvedValue({ id: "audit_1" });
    mocks.transaction.mockImplementation(async (callback) => callback({ followUpRecord: { create: mocks.followUpCreate }, auditLog: { create: mocks.auditLogCreate } }));
    const response = await POST(new Request("https://example.test/api/v1/followups", { method: "POST", headers: { "x-request-id": "req_followup_create" }, body: JSON.stringify({ storeId: "store_1", memberId: "member_1", type: "CALL", content: "反馈不错", nextAction: "明日回访" }) }));
    expect(response.status).toBe(201);
    expect(mocks.followUpCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ storeId: "store_1", memberId: "member_1", employeeId: "emp_1", type: "CALL" }) }));
    expect(mocks.auditLogCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "CREATE", resourceType: "FollowUpRecord", resourceId: "followup_1", requestId: "req_followup_create" }) }));
  });
});
