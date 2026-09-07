import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), findFirst: vi.fn() }));
vi.mock("@/lib/server/prisma", () => ({ prisma: { member: { findMany: mocks.findMany, findFirst: mocks.findFirst } } }));

import { MemberReferenceResolver } from "@/agent-system/gateway/member-reference-resolver";
import { emptyWorkingState } from "@/agent-system/state/working-state";
import type { RuntimeContext } from "@/agent-system/runtime/runtime-context";

const context: RuntimeContext = {
  auth: { employee: { employeeId: "employee-a", storeId: "store-a", email: "a@test", name: "a", roleCodes: [], roleLevel: "staff", roleName: "员工", permissions: ["member:read"] }, employeeStoreId: "store-a", isBootstrapAdmin: false },
  operatorId: "employee-a", storeId: "store-a", sessionId: "s", traceId: "t", trustZone: "cloud",
};

describe("MemberReferenceResolver", () => {
  it("resolves item-N only through working state and rechecks ACL", async () => {
    const state = emptyWorkingState();
    state.activeQuery = { queryId: "q", semanticFilters: {}, resolvedFilters: {}, resultRef: "query-a", resultMemberIds: ["member-1"], page: 1, pageSize: 10, resultCount: 1 };
    mocks.findFirst.mockResolvedValue({ id: "member-1" });
    const result = await new MemberReferenceResolver().resolve({ capability: "get_member_profile", requestMode: "new_query", args: { memberRef: { kind: "reference", ref: "result_item", value: 1 } } }, state, context);
    expect(result).toEqual({ memberId: "member-1" });
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "member-1", storeId: "store-a", ownerEmployeeId: "employee-a" }) }));
  });

  it("does not treat a stale item reference as authorization", async () => {
    const state = emptyWorkingState();
    state.activeQuery = { queryId: "q", semanticFilters: {}, resolvedFilters: {}, resultRef: "query-a", resultMemberIds: ["moved-member"], page: 1, pageSize: 10, resultCount: 1 };
    mocks.findFirst.mockResolvedValue(null);
    const result = await new MemberReferenceResolver().resolve({ capability: "get_member_profile", requestMode: "new_query", args: { memberRef: { kind: "reference", ref: "result_item", value: 1 } } }, state, context);
    expect(result).toMatchObject({ status: "NotFound" });
  });

  it("uses scoped exact name and asks for selection when duplicate", async () => {
    mocks.findMany.mockResolvedValue([{ id: "one" }, { id: "two" }]);
    const result = await new MemberReferenceResolver().resolve({ capability: "get_member_profile", requestMode: "new_query", args: { memberName: { kind: "exact", value: "王晓明" } } }, emptyWorkingState(), context);
    expect(result).toMatchObject({ status: "ClarificationRequired" });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: "store-a", ownerEmployeeId: "employee-a" }) }));
  });
});
