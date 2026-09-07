import { isDeepStrictEqual } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { capabilityRequestSchema } from "@/agent-system/contracts/capability-request";
import type { EvalTurn, Phase1EvalDataset } from "@/agent-system/eval/phase1-runner";
import { managerDecisionSchema, ModelManager } from "@/agent-system/runtime/manager";
import type { ModelContextView } from "@/agent-system/runtime/context-builder";
import { completeAiText } from "@/agent-system/shared/ai/client";
import { getAiConfig } from "@/agent-system/shared/ai/config";

const enabled = process.env.AGENT_REAL_EVAL_ENABLED === "1";
const capabilities: ModelContextView["capabilities"] = [
  { name: "search_members", description: "按明确的会员条件搜索，不进行匹配评分或排序。", arguments: { gender: "性别", age: "年龄", currentLocation: "现居地区", hometownLocation: "籍贯地区", occupation: "职业", education: "学历", incomeRange: "收入范围" } },
  { name: "get_member_profile", description: "查看一个已解析且当前有权限访问的会员摘要。", arguments: { memberRef: "结果 item-N 或已选会员" } },
];

type RealEvalResult = {
  case_id: string;
  turn: number;
  input: string;
  mode: "provider" | "server_local";
  expected: unknown;
  actual: unknown;
  context: Pick<ModelContextView, "history" | "working">;
  pass: boolean;
  failure_stage: "Manager" | null;
  latency_ms: number;
};

function expectedDecision(turn: EvalTurn) {
  const parsed = managerDecisionSchema.safeParse(turn.managerDecision);
  return parsed.success ? parsed.data : null;
}

function matchesDecision(expected: NonNullable<ReturnType<typeof expectedDecision>>, actual: unknown) {
  if (expected.kind === "answer") return (actual as { kind?: string })?.kind === "answer";
  const parsed = capabilityRequestSchema.safeParse((actual as { request?: unknown })?.request);
  return (actual as { kind?: string })?.kind === "capability" &&
    parsed.success &&
    parsed.data.capability === expected.request.capability &&
    parsed.data.requestMode === expected.request.requestMode &&
    isDeepStrictEqual(parsed.data.args, expected.request.args);
}

function nextWorkingState(turn: EvalTurn, actual: unknown, previous: ModelContextView["working"]): ModelContextView["working"] {
  const request = capabilityRequestSchema.safeParse((actual as { request?: unknown })?.request);
  if (request.success && request.data.capability === "search_members") {
    return { ...previous, stateVersion: previous.stateVersion + 1, hasActiveQuery: true, activeFilters: request.data.args as Record<string, unknown>, selectedMember: false };
  }
  if (turn.expect.capability === "get_member_profile") {
    return { ...previous, stateVersion: previous.stateVersion + 1, selectedMember: true };
  }
  return previous;
}

describe.runIf(enabled)("Phase 1 real-provider manager eval", () => {
  it("replays structured scenarios with full CapabilityRequest argument comparison", async () => {
    const dataset = JSON.parse(await readFile(resolve(process.cwd(), "evals/phase1-backoffice.json"), "utf8")) as Phase1EvalDataset;
    const config = await getAiConfig();
    if (!config.configured || !config.provider) throw new Error("Real-model eval is enabled but the current server-side AI provider is not configured.");

    const manager = new ModelManager((system, content) =>
      completeAiText({ messages: [{ role: "system", content: system }, { role: "user", content }] }, config),
    );
    const results: RealEvalResult[] = [];

    for (const scenario of dataset.scenarios) {
      const history: ModelContextView["history"] = [];
      let working: ModelContextView["working"] = { stateVersion: 0, hasActiveQuery: false, activeFilters: null, selectedMember: false, clarification: null };

      for (const [index, turn] of scenario.turns.entries()) {
        const expected = expectedDecision(turn);
        const deterministicOnly = turn.managerDecision !== undefined && !expected;
        const view: ModelContextView = { input: turn.input, history: [...history], working, capabilities };
        const started = Date.now();
        let actual: unknown = null;
        let pass = false;
        const mode = expected ? "provider" : "server_local";

        if (deterministicOnly) {
          actual = { deterministic_only: true };
          pass = true;
        } else if (expected) {
          try {
            actual = await manager.decide(view);
            pass = matchesDecision(expected, actual);
          } catch (error) {
            actual = { error: error instanceof Error ? error.name : "ProviderError" };
          }
        } else {
          // item-N and selected-member remain server-local: the model never supplies an ID.
          actual = { kind: "server_local", capability: turn.expect.capability ?? null };
          pass = turn.expect.capability === "get_member_profile";
        }

        results.push({ case_id: scenario.id, turn: index + 1, input: turn.input, mode, expected: expected ?? (deterministicOnly ? { deterministic_only: true } : { server_local: turn.expect.capability ?? null }), actual, context: { history: view.history, working: view.working }, pass, failure_stage: pass ? null : "Manager", latency_ms: Date.now() - started });
        history.push({ role: "user", content: turn.input });
        history.push({ role: "assistant", content: pass ? "已处理上一轮请求。" : "上一轮请求未通过评估。" });
        working = nextWorkingState(turn, actual, working);
      }
    }

    const report = {
      schema_version: "phase1-agent-eval-v0.1",
      runner: "real-provider-manager-scenario-replay",
      provider: config.provider,
      model: config.model,
      total_cases: results.length,
      passed_cases: results.filter((item) => item.pass).length,
      failed_cases: results.filter((item) => !item.pass).length,
      failure_categories: results.filter((item) => !item.pass).reduce<Record<string, number>>((all, item) => {
        const stage = item.failure_stage ?? "Unknown";
        all[stage] = (all[stage] ?? 0) + 1;
        return all;
      }, {}),
      results,
    };
    const outputDir = process.env.AGENT_EVAL_OUTPUT_DIR ?? resolve(process.cwd(), "evals/results");
    await mkdir(outputDir, { recursive: true });
    await Promise.all([
      writeFile(resolve(outputDir, "phase1-real-provider.latest.json"), JSON.stringify(report, null, 2) + "\n"),
      writeFile(resolve(outputDir, "phase1-real-provider.latest.md"), [
        "# Phase 1 Real-Provider Eval Summary",
        "",
        "- Provider: " + config.provider,
        "- Model: " + config.model,
        "- Scenario turns: " + report.total_cases,
        "- Passed: " + report.passed_cases,
        "- Failed: " + report.failed_cases,
        "",
        "Full CapabilityRequest args are compared, including semantic operator and all declared filters.",
        "Multi-turn replays preserve history and WorkingState; server-local item references never expose IDs to the model.",
        "",
      ].join("\n")),
    ]);

    expect(report.failed_cases).toBe(0);
  }, 600_000);
});
