import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
});
