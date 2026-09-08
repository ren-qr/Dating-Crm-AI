import { describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/server/prisma", () => ({ prisma: { member: { findMany: mocks.findMany } } }));
import { AgentLoop } from "@/agent-system/runtime/agent-loop";
import { CapabilityRegistry } from "@/agent-system/capabilities/registry";
import { searchCapability } from "@/agent-system/capabilities/tools/search-members";
import { searchMembersAdapter } from "@/agent-system/execution/adapters/search-members";
import { MemoryStateStore } from "@/agent-system/state/state-store";
import { MemoryTrace } from "@/agent-system/tracing/trace";
import { MemoryAudit } from "@/agent-system/tracing/audit";
import { MemoryEval } from "@/agent-system/tracing/eval-hooks";
import type { RuntimeContext } from "@/agent-system/runtime/runtime-context";

describe("real search adapter + existing deterministic tool", () => {
  it("applies authenticated store and owner in the Prisma query, then projects a cloud-safe result", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "db-id",
        name: "合成测试名",
        birthDate: "1995-01-01",
        gender: "FEMALE",
        occupation: "工程师",
        education: "本科",
        currentProvince: "33",
        currentCity: "3301",
        currentDistrict: null,
      },
    ]);
    const context: RuntimeContext = {
      auth: {
        employee: {
          employeeId: "employee",
          storeId: "store",
          email: "test@example.test",
          name: "test",
          roleCodes: [],
          roleLevel: "staff",
          roleName: "员工",
          permissions: ["member:read"],
        },
        isBootstrapAdmin: false,
        employeeStoreId: "store",
      },
      operatorId: "employee",
      storeId: "store",
      sessionId: "session",
      traceId: "trace",
      trustZone: "cloud",
    };
    const manager = {
      decide: vi
        .fn()
        .mockResolvedValue({
          kind: "capability",
          request: {
            capability: "search_members",
            args: { gender: { kind: "exact", value: "FEMALE" } },
          },
        }),
      respond: vi.fn().mockResolvedValue("找到1条结果"),
    };
    const loop = new AgentLoop({
      registry: new CapabilityRegistry([searchCapability]),
      adapters: { search_members: searchMembersAdapter },
      state: new MemoryStateStore(),
      trace: new MemoryTrace(),
      audit: new MemoryAudit(),
      evalHooks: new MemoryEval(),
    });
    expect((await loop.run({ message: "查询女生" }, context, manager)).status).toBe("Completed");
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: "store",
          ownerEmployeeId: "employee",
          gender: "FEMALE",
        }),
      }),
    );
    expect(JSON.stringify(manager.respond.mock.calls[0])).not.toContain("合成测试名");
    expect(JSON.stringify(manager.respond.mock.calls[0])).not.toContain("db-id");
  });
});
