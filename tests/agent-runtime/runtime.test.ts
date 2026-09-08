import { describe, expect, it, vi } from "vitest";
import { AgentLoop } from "@/agent-system/runtime/agent-loop";
import { CapabilityRegistry, type RawResult } from "@/agent-system/capabilities/registry";
import { searchCapability } from "@/agent-system/capabilities/tools/search-members";
import { getMemberProfileCapability } from "@/agent-system/capabilities/tools/get-member-profile";
import { MemoryStateStore } from "@/agent-system/state/state-store";
import { MemoryTrace } from "@/agent-system/tracing/trace";
import { MemoryAudit } from "@/agent-system/tracing/audit";
import { MemoryEval } from "@/agent-system/tracing/eval-hooks";
import { CapabilityGateway } from "@/agent-system/gateway/capability-gateway";
import { Executor } from "@/agent-system/execution/executor";
import { MinimalContextBuilder } from "@/agent-system/runtime/context-builder";
import { applyResultPolicy } from "@/agent-system/result/result-policy";
import { emptyWorkingState } from "@/agent-system/state/working-state";
import type { RuntimeContext } from "@/agent-system/runtime/runtime-context";
import type { ResolvedAction } from "@/agent-system/contracts/resolved-action";
import type { SafeResult } from "@/agent-system/contracts/safe-result";

const context: RuntimeContext = {
  auth: { employee: { employeeId: "employee-a", storeId: "store-a", email: "fixture@example.test", name: "fixture", roleCodes: ["consultant"], roleLevel: "staff", roleName: "员工", permissions: ["member:read"] }, employeeStoreId: "store-a", isBootstrapAdmin: false },
  operatorId: "employee-a", storeId: "store-a", sessionId: "session-a", traceId: "trace-a", trustZone: "cloud",
};
const request = { capability: "search_members", args: { gender: { kind: "exact", value: "FEMALE" } } };
const raw: RawResult = { rows: [{ storeId: "store-a", ownerId: "employee-a", data: { memberId: "private-db-id", name: "测试会员", age: 28, gender: "FEMALE", occupation: "工程师", education: "本科", currentLocation: { province: "33", city: "3301", district: null } } }], meta: { page: 1, pageSize: 20, total: 1, hasNext: false } };

function setup() {
  const registry = new CapabilityRegistry([searchCapability, getMemberProfileCapability]);
  const trace = new MemoryTrace(); const state = new MemoryStateStore(); const audit = new MemoryAudit(); const evalHooks = new MemoryEval();
  const adapter = vi.fn().mockResolvedValue(raw);
  const manager = { decide: vi.fn().mockResolvedValue({ kind: "capability", request }), respond: vi.fn().mockResolvedValue("找到一位会员。") };
  const dependencies = { registry, trace, state, audit, evalHooks, adapters: { search_members: adapter, get_member_profile: adapter } };
  return { ...dependencies, adapter, manager, loop: new AgentLoop(dependencies) };
}

describe("Phase 1 Agent Runtime", () => {
  it("T01 runs Manager → Gateway → Executor and cloud manager sees no identity", async () => {
    const s = setup(); const result = await s.loop.run({ message: "查找女生" }, context, s.manager);
    expect(result.status).toBe("Completed"); expect(s.adapter).toHaveBeenCalledTimes(1);
    const modelInput = JSON.stringify(s.manager.respond.mock.calls[0][0]);
    for (const hidden of ["private-db-id", "测试会员", "employee-a", "store-a", "fixture@example.test"]) expect(modelInput).not.toContain(hidden);
    expect(result.displayResult?.items[0]).toMatchObject({ name: "测试会员", ref: "item-1" });
    expect(JSON.stringify(result.displayResult)).not.toContain("private-db-id");
  });

  it("T02 rejects unexpected authority, schema and range parameters before execution", async () => {
    const s = setup(); const gateway = new CapabilityGateway(s.registry, s.trace);
    for (const input of [
      { ...request, permission: "member:read" },
      { ...request, args: { storeId: { kind: "exact", value: "other" } } },
      { ...request, args: { pageSize: { kind: "exact", value: 100000 } } },
      { ...request, args: { ageMin: { kind: "exact", value: 40 }, ageMax: { kind: "exact", value: 20 } } },
    ]) expect((await gateway.resolve(input, context, emptyWorkingState())).status).toBe("ValidationError");
    expect(s.adapter).not.toHaveBeenCalled();
  });

  it("T03 denies missing permission before tool execution", async () => {
    const s = setup(); const denied = { ...context, auth: { ...context.auth, employee: { ...context.auth.employee, permissions: [] } } };
    expect((await s.loop.run({ message: "查询" }, denied, s.manager)).status).toBe("AuthorizationDenied");
    expect(s.adapter).not.toHaveBeenCalled();
  });

  it("T04 clarifies undefined education and preserves query state", async () => {
    const s = setup(); s.manager.decide.mockResolvedValue({ kind: "capability", request: { capability: "search_members", args: { education: { kind: "semantic", concept: "high" } } } });
    const result = await s.loop.run({ message: "条件好的会员" }, context, s.manager);
    expect(result.status).toBe("ClarificationRequired"); expect(result.clarification?.field).toBe("education"); expect(s.adapter).not.toHaveBeenCalled();
  });

  it("T05 resets state without a database query", async () => {
    const s = setup(); await s.loop.run({ message: "查询" }, context, s.manager);
    const result = await s.loop.run({ message: "清空条件" }, { ...context, traceId: "trace-b" }, s.manager);
    expect(result.state.hasActiveQuery).toBe(false); expect(s.adapter).toHaveBeenCalledTimes(1);
  });

  it("T06 commit happens only after executor success", async () => {
    const s = setup(); s.adapter.mockRejectedValueOnce(new Error("connection refused"));
    expect((await s.loop.run({ message: "查询" }, context, s.manager)).status).toBe("Failed");
    await s.state.withState(context, async (state) => expect(state.working.activeQuery).toBeNull());
  });

  it("T07 cloud rejects raw sensitive text before Manager and never invokes an adapter", async () => {
    const s = setup();
    expect((await s.loop.run({ message: "查手机号13800000000的会员" }, context, s.manager)).status).toBe("PolicyRejected");
    expect(s.manager.decide).not.toHaveBeenCalled(); expect(s.adapter).not.toHaveBeenCalled();
  });

  it("T08 blocks forged, replayed and cross-session resolved actions", async () => {
    const s = setup(); const gateway = new CapabilityGateway(s.registry, s.trace); const executor = new Executor(s.registry, gateway, s.adapters);
    await expect(executor.execute({ capability: "search_members" } as ResolvedAction, context)).rejects.toThrow();
    const resolved = await gateway.resolve(request, context, emptyWorkingState());
    if (resolved.status !== "ResolvedAction") throw new Error("expected action");
    await expect(executor.execute(resolved.action, { ...context, sessionId: "other" })).rejects.toThrow();
    await executor.execute(resolved.action, context); await expect(executor.execute(resolved.action, context)).rejects.toThrow();
  });

  it("T09 model result policy filters other owners and disallows display payload in a model context", () => {
    const s = setup(); const result = applyResultPolicy({ ...raw, rows: [...raw.rows, { ...raw.rows[0], ownerId: "other" }] }, searchCapability, context, s.trace);
    expect(result.data.items).toHaveLength(1); expect(JSON.stringify(result)).not.toContain("private-db-id");
    const builder = new MinimalContextBuilder(s.registry);
    expect(() => builder.build("query", { log: [], working: emptyWorkingState(), tasks: [] }, context, {} as SafeResult)).toThrow();
  });

  it("T10 isolates session state by employee, store and trust zone", async () => {
    const s = setup(); await s.loop.run({ message: "查询" }, context, s.manager);
    for (const changed of [{ ...context, operatorId: "other" }, { ...context, storeId: "other" }, { ...context, trustZone: "local" as const }]) {
      await expect(s.loop.run({ message: "继续" }, changed, s.manager)).rejects.toThrow("会话不可访问");
    }
  });
});
