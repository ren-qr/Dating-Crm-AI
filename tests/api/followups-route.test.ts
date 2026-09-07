import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentEmployee: vi.fn(),
  employeeFindUnique: vi.fn(),
  employeeFindFirst: vi.fn(),
  memberFindFirst: vi.fn(),
  matchFindFirst: vi.fn(),
  blacklistFindFirst: vi.fn(),
  followUpCreate: vi.fn(),
  reminderUpsert: vi.fn(),
  auditLogCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/business-support/permissions/current-user", () => ({
  getCurrentEmployee: mocks.getCurrentEmployee,
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    employee: {
      findUnique: mocks.employeeFindUnique,
      findFirst: mocks.employeeFindFirst,
    },
    member: { findFirst: mocks.memberFindFirst },
    matchRecord: { findFirst: mocks.matchFindFirst },
    blacklistEntry: { findFirst: mocks.blacklistFindFirst },
    followUpRecord: { create: mocks.followUpCreate },
    reminderTask: { upsert: mocks.reminderUpsert },
    auditLog: { create: mocks.auditLogCreate },
    $transaction: mocks.transaction,
  },
}));

const { POST } = await import("@/app/api/v1/followups/route");

const employee = {
  employeeId: "emp_1",
  email: "staff@example.com",
  name: "Staff",
  roleCodes: ["operator"],
  permissions: ["followup:write"],
};

afterEach(() => vi.clearAllMocks());

describe("POST /api/v1/followups", () => {
  it("returns 1001 when unauthenticated", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(null);

    const response = await POST(new Request("https://example.test/api/v1/followups", { method: "POST" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: 1001, message: "未认证", data: null });
  });

  it("returns 1002 without followup write permission", async () => {
    mocks.getCurrentEmployee.mockResolvedValue({ ...employee, permissions: [] });

    const response = await POST(new Request("https://example.test/api/v1/followups", { method: "POST", body: "{}" }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 1002, message: "无权限", data: null });
  });

  it("returns 1000 for invalid body before store lookup", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(employee);

    const response = await POST(
      new Request("https://example.test/api/v1/followups", {
        method: "POST",
        body: JSON.stringify({ memberId: "member_1", content: "已沟通" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 1000, message: "参数错误", data: null });
    expect(mocks.employeeFindUnique).not.toHaveBeenCalled();
  });

  it("returns 1005 and writes audit log when the member is blacklisted", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(employee);
    mocks.employeeFindUnique.mockResolvedValue({ storeId: "store_1" });
    mocks.memberFindFirst.mockResolvedValue({ id: "member_1", memberNo: "M001", ownerEmployeeId: "emp_2" });
    mocks.blacklistFindFirst.mockResolvedValue({
      id: "blacklist_1",
      reason: "高风险投诉",
      severity: "CRITICAL",
      status: "ACTIVE",
      memberId: "member_1",
      expiresAt: null,
    });
    mocks.auditLogCreate.mockResolvedValue({ id: "audit_block" });

    const response = await POST(
      new Request("https://example.test/api/v1/followups", {
        method: "POST",
        headers: { "x-request-id": "req_followup_blocked" },
        body: JSON.stringify({
          storeId: "store_1",
          memberId: "member_1",
          type: "CALL",
          content: "尝试回访",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      code: 1005,
      message: "黑名单拦截",
      data: { blacklistEntryId: "blacklist_1", severity: "CRITICAL" },
      requestId: "req_followup_blocked",
    });
    expect(mocks.followUpCreate).not.toHaveBeenCalled();
    expect(mocks.auditLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "BLACKLIST_BLOCK",
        resourceType: "FollowUpRecord",
        resourceId: "member_1",
        requestId: "req_followup_blocked",
        metadataJson: expect.objectContaining({ entryId: "blacklist_1", operation: "followup.create" }),
      }),
    }));
  });

  it("creates followup, reminder, and audit log for valid request", async () => {
    const createdAt = new Date("2026-07-11T04:00:00.000Z");
    const nextAt = "2026-07-12T10:00:00.000+08:00";
    mocks.getCurrentEmployee.mockResolvedValue(employee);
    mocks.employeeFindUnique.mockResolvedValue({ storeId: "store_1" });
    mocks.memberFindFirst.mockResolvedValue({ id: "member_1", memberNo: "M001", ownerEmployeeId: "emp_2" });
    mocks.matchFindFirst.mockResolvedValue({ id: "match_1" });
    mocks.blacklistFindFirst.mockResolvedValue(null);
    mocks.employeeFindFirst.mockResolvedValue({ id: "emp_2" });
    mocks.followUpCreate.mockResolvedValue({
      id: "followup_1",
      storeId: "store_1",
      memberId: "member_1",
      matchId: "match_1",
      employeeId: "emp_1",
      type: "CALL",
      content: "反馈不错",
      nextAction: "明日回访",
      nextAt: new Date(nextAt),
      createdAt,
    });
    mocks.reminderUpsert.mockResolvedValue({ id: "reminder_1" });
    mocks.auditLogCreate.mockResolvedValue({ id: "audit_1" });
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        followUpRecord: { create: mocks.followUpCreate },
        reminderTask: { upsert: mocks.reminderUpsert },
        auditLog: { create: mocks.auditLogCreate },
      }),
    );

    const response = await POST(
      new Request("https://example.test/api/v1/followups", {
        method: "POST",
        headers: { "x-request-id": "req_followup_create" },
        body: JSON.stringify({
          storeId: "store_1",
          memberId: "member_1",
          matchId: "match_1",
          type: "CALL",
          content: "反馈不错",
          nextAction: "明日回访",
          nextAt,
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.reminderUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ idempotencyKey: "followup:followup_1", assigneeEmployeeId: "emp_2" }),
      update: expect.objectContaining({ status: "PENDING", completedAt: null }),
    }));
    expect(mocks.auditLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "CREATE",
        resourceType: "FollowUpRecord",
        resourceId: "followup_1",
        requestId: "req_followup_create",
        metadataJson: expect.objectContaining({ hasReminder: true, reminderId: "reminder_1" }),
      }),
    }));
    expect(body).toMatchObject({
      code: 0,
      message: "创建成功",
      data: { id: "followup_1", reminderId: "reminder_1", method: "CALL", type: "CALL" },
    });
  });
});
