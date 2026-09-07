import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CapabilityRegistry, type RawResult } from "@/agent-system/capabilities/registry";
import { searchCapability } from "@/agent-system/capabilities/tools/search-members";
import type { ResolvedAction } from "@/agent-system/contracts/resolved-action";
import { Executor } from "@/agent-system/execution/executor";
import { CapabilityGateway } from "@/agent-system/gateway/capability-gateway";
import { applyResultPolicy, buildAuthorizedDisplayResult } from "@/agent-system/result/result-policy";
import { MinimalContextBuilder } from "@/agent-system/runtime/context-builder";
import type { RuntimeContext } from "@/agent-system/runtime/runtime-context";
import { emptyWorkingState } from "@/agent-system/state/working-state";
import { MemoryTrace } from "@/agent-system/tracing/trace";

const mocks = vi.hoisted(() => ({
  areaFindMany: vi.fn(),
  memberFindMany: vi.fn(),
  memberFindFirst: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    area: { findMany: mocks.areaFindMany },
    member: { findMany: mocks.memberFindMany, findFirst: mocks.memberFindFirst },
  },
}));

import {
  renderPhase1EvalSummary,
  runPhase1DeterministicEval,
  type Phase1EvalDataset,
} from "@/agent-system/eval/phase1-runner";

const areaByName = new Map([
  ["上海", { code: "310100", name: "上海市", level: "CITY" }],
  ["杭州", { code: "330100", name: "杭州市", level: "CITY" }],
  ["北京", { code: "110100", name: "北京市", level: "CITY" }],
  ["成都", { code: "510100", name: "成都市", level: "CITY" }],
]);

beforeEach(() => {
  mocks.areaFindMany.mockImplementation(({ where }: { where: { name?: { in?: string[] } } }) => {
    const name = where.name?.in?.find((candidate) => areaByName.has(candidate));
    return Promise.resolve(name ? [areaByName.get(name)] : []);
  });
  mocks.memberFindMany.mockImplementation(({ where }: { where: { memberNo?: string; name?: { equals?: string } } }) => {
    if (where.memberNo === "TEST-001") return Promise.resolve([{ id: "member-1" }]);
    if (where.memberNo === "A2-001" || where.memberNo === "B1-001") return Promise.resolve([]);
    if (where.name?.equals === "王晓明") return Promise.resolve([{ id: "member-1" }]);
    if (where.name?.equals === "张伟") return Promise.resolve([{ id: "member-2" }, { id: "member-3" }]);
    return Promise.resolve([]);
  });
  mocks.memberFindFirst.mockImplementation(({ where }: { where: { id?: string } }) =>
    Promise.resolve(where.id?.startsWith("member-") ? { id: where.id } : null),
  );
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Phase 1 executable deterministic eval", () => {
  it("loads every scenario, executes the production runtime chain, and emits machine/human results", async () => {
    const dataset = JSON.parse(
      await readFile(resolve(process.cwd(), "evals/phase1-backoffice.json"), "utf8"),
    ) as Phase1EvalDataset;

    expect(dataset.schemaVersion).toBe("phase1-agent-eval-v0.1");
    expect(dataset.scenarios).toHaveLength(60);
    expect(dataset.scenarios.some((scenario) => scenario.turns.length > 1)).toBe(true);

    const report = await runPhase1DeterministicEval(dataset);
    const outputDir = process.env.AGENT_EVAL_OUTPUT_DIR ?? resolve(tmpdir(), "meetra-phase1-agent-eval");
    await mkdir(outputDir, { recursive: true });
    await Promise.all([
      writeFile(resolve(outputDir, "phase1-deterministic.latest.json"), `${JSON.stringify(report, null, 2)}\n`),
      writeFile(resolve(outputDir, "phase1-deterministic.latest.md"), renderPhase1EvalSummary(report)),
    ]);

    expect(report.total_scenarios).toBe(60);
    expect(report.failed_turns).toBe(0);
    expect(report.security_passed).toBe(report.security_total);
  });

  it("T37-T42 enforce resolved-action and model-result trust boundaries", async () => {
    const registry = new CapabilityRegistry([searchCapability]);
    const trace = new MemoryTrace();
    const gateway = new CapabilityGateway(registry, trace);
    const context: RuntimeContext = {
      auth: {
        employee: {
          employeeId: "employee-a",
          storeId: "store-a",
          email: "eval@example.test",
          name: "评估员工",
          roleCodes: ["consultant"],
          roleLevel: "staff",
          roleName: "员工",
          permissions: ["member:read"],
        },
        employeeStoreId: "store-a",
        isBootstrapAdmin: false,
      },
      operatorId: "employee-a",
      storeId: "store-a",
      sessionId: "security-session",
      traceId: "security-trace",
      trustZone: "cloud",
    };
    const raw: RawResult = {
      rows: [{
        storeId: "store-a",
        ownerId: "employee-a",
        data: {
          memberId: "private-db-id",
          memberNo: "TEST-0001",
          name: "测试会员",
          age: 28,
          gender: "FEMALE",
          occupation: "工程师",
          education: "硕士",
          currentLocation: { province: "31", city: "3101", district: "310101" },
          phone: "13800000000",
          idCard: "110101199001011234",
          hash: "private-hash",
          selfDescription: "不应进入模型上下文的自我描述",
          followUpReason: "不应进入模型上下文的跟进内容",
          blacklistReason: "不应进入模型上下文的风险原因",
        },
      }],
      meta: { page: 1, pageSize: 10, total: 1, hasNext: false },
    };
    const executableRaw: RawResult = {
      rows: raw.rows.map((row) => ({
        ...row,
        data: {
          memberId: row.data.memberId,
          name: row.data.name,
          age: row.data.age,
          gender: row.data.gender,
          occupation: row.data.occupation,
          education: row.data.education,
          currentLocation: row.data.currentLocation,
        },
      })),
      meta: raw.meta,
    };
    const executor = new Executor(registry, gateway, {
      search_members: async () => executableRaw,
    });
    const request = { capability: "search_members", args: { gender: { kind: "exact", value: "FEMALE" } } };

    // T37: a structural lookalike was never issued by the Gateway.
    await expect(executor.execute({ capability: "search_members" } as ResolvedAction, context)).rejects.toThrow("Unapproved action");

    // T38: an issued action is single-use.
    const replay = await gateway.resolve(request, context, emptyWorkingState());
    if (replay.status !== "ResolvedAction") throw new Error("expected action");
    await expect(executor.execute(replay.action, context)).resolves.toEqual(executableRaw);
    await expect(executor.execute(replay.action, context)).rejects.toThrow("Unapproved action");

    // T39: an action cannot cross a session boundary.
    const crossSession = await gateway.resolve(request, context, emptyWorkingState());
    if (crossSession.status !== "ResolvedAction") throw new Error("expected action");
    await expect(executor.execute(crossSession.action, { ...context, sessionId: "other-session" })).rejects.toThrow("Unapproved action");

    const builder = new MinimalContextBuilder(registry);
    const cloudSafe = applyResultPolicy(raw, searchCapability, context, trace);
    const cloudContext = builder.build("查询", { log: [], working: emptyWorkingState(), tasks: [] }, context, cloudSafe);
    const cloudText = JSON.stringify({ safe: cloudSafe, context: cloudContext });
    for (const hidden of ["private-db-id", "TEST-0001", "测试会员", "employee-a", "store-a", "13800000000", "110101199001011234", "private-hash", "自我描述", "跟进内容", "风险原因"]) {
      expect(cloudText).not.toContain(hidden);
    }

    // T40: cloud-safe output has no identity or free-text; T41: local may include
    // the approved display name, but never internal/sensitive identifiers.
    const localContext = { ...context, sessionId: "local-session", traceId: "local-trace", trustZone: "local" as const };
    const localSafe = applyResultPolicy(raw, searchCapability, localContext, trace);
    const localText = JSON.stringify(builder.build("查询", { log: [], working: emptyWorkingState(), tasks: [] }, localContext, localSafe));
    expect(localText).toContain("测试会员");
    for (const hidden of ["private-db-id", "TEST-0001", "13800000000", "110101199001011234", "private-hash", "自我描述", "跟进内容", "风险原因"]) {
      expect(localText).not.toContain(hidden);
    }

    // T42: AuthorizedDisplayResult is intentionally rejected as model context.
    const display = buildAuthorizedDisplayResult(raw, context, "query-ref", "member_list");
    expect(() => builder.build("查询", { log: [], working: emptyWorkingState(), tasks: [] }, context, display as never)).toThrow("Unfiltered result");
  });
});
