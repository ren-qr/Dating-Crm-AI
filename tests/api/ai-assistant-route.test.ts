import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runAssistantCore: vi.fn(),
  executeMemberQuery: vi.fn(),
  completeAiText: vi.fn(),
  getAiConfig: vi.fn(),
  requireCurrentEmployee: vi.fn(),
  requirePermission: vi.fn(),
  resolveStoreScope: vi.fn(),
  recordTrace: vi.fn(),
}));

vi.mock("@/ai-assistant/assistant-core", () => ({
  runAssistantCore: mocks.runAssistantCore,
}));

vi.mock("@/ai-query/execute-member-query", () => ({
  executeMemberQuery: mocks.executeMemberQuery,
}));

vi.mock("@/lib/server/ai/client", () => ({
  completeAiText: mocks.completeAiText,
}));

vi.mock("@/lib/server/ai/config", () => ({
  getAiConfig: mocks.getAiConfig,
}));

vi.mock("@/lib/server/query-trace", () => ({
  applicationTrace: { record: mocks.recordTrace },
}));

vi.mock("@/lib/server/route-helpers", () => ({
  requireCurrentEmployee: mocks.requireCurrentEmployee,
  requirePermission: mocks.requirePermission,
  resolveStoreScope: mocks.resolveStoreScope,
}));

const { POST } = await import("@/app/api/v1/ai/assistant/route");

const auth = {
  employee: { employeeId: "employee_1", permissions: ["member:read"] },
  isBootstrapAdmin: false,
  employeeStoreId: "store_1",
};

function request(messages: Array<{ role: "user" | "assistant"; content: string }>) {
  return new Request("https://example.test/api/v1/ai/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-request-id": "assistant-route-test" },
    body: JSON.stringify({ messages }),
  });
}

afterEach(() => vi.clearAllMocks());

describe("POST /api/v1/ai/assistant", () => {
  it("stops before the Assistant Core when the current employee is not authenticated", async () => {
    mocks.requireCurrentEmployee.mockResolvedValue(new Response(JSON.stringify({ code: 1001 }), { status: 401 }));

    const response = await POST(request([{ role: "user", content: "你好" }]));

    expect(response.status).toBe(401);
    expect(mocks.runAssistantCore).not.toHaveBeenCalled();
  });

  it("returns ordinary Assistant Core replies without starting a member query", async () => {
    mocks.requireCurrentEmployee.mockResolvedValue(auth);
    mocks.requirePermission.mockReturnValue(null);
    mocks.getAiConfig.mockResolvedValue({ configured: true });
    mocks.runAssistantCore.mockResolvedValue({ type: "reply", content: "你好，我可以协助查询会员。" });

    const response = await POST(request([{ role: "user", content: "你好" }]));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ action: { type: "reply" }, content: "你好，我可以协助查询会员。" });
    expect(mocks.executeMemberQuery).not.toHaveBeenCalled();
  });

  it("executes query_members only through the existing Query V2 executor and derived scope", async () => {
    const query = {
      task: "search_members",
      filters: [{ field: "gender", op: "eq", value: "FEMALE" }],
      unresolved: [],
    };
    mocks.requireCurrentEmployee.mockResolvedValue(auth);
    mocks.requirePermission.mockReturnValue(null);
    mocks.getAiConfig.mockResolvedValue({ configured: true });
    mocks.runAssistantCore.mockResolvedValue({ type: "query_members", query });
    mocks.resolveStoreScope.mockResolvedValue({ storeId: "store_1" });
    mocks.executeMemberQuery.mockResolvedValue({
      task: "search_members",
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      hasNext: false,
    });

    const response = await POST(request([{ role: "user", content: "找女生" }]));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.executeMemberQuery).toHaveBeenCalledWith(query, {
      storeId: "store_1",
      ownerEmployeeId: "employee_1",
      traceId: "assistant-route-test",
    });
    expect(body.data).toMatchObject({ action: { type: "query_members", query }, result: { total: 0 } });
  });

  it("does not execute unresolved Query V2 conditions", async () => {
    const query = {
      task: "search_members",
      filters: [{ field: "gender", op: "eq", value: "FEMALE" }],
      unresolved: [{ text: "条件不错", reason: "没有正式业务标准" }],
    };
    mocks.requireCurrentEmployee.mockResolvedValue(auth);
    mocks.requirePermission.mockReturnValue(null);
    mocks.getAiConfig.mockResolvedValue({ configured: true });
    mocks.runAssistantCore.mockResolvedValue({ type: "query_members", query });

    const response = await POST(request([{ role: "user", content: "条件不错的女生" }]));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ action: { type: "query_members", query } });
    expect(mocks.executeMemberQuery).not.toHaveBeenCalled();
    expect(mocks.resolveStoreScope).not.toHaveBeenCalled();
  });
});
