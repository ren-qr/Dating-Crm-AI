import { isDeepStrictEqual } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { capabilityRequestSchema, type CapabilityRequest } from "@/agent-system/contracts/capability-request";
import type { EvalTurn, Phase1EvalDataset } from "@/agent-system/eval/phase1-runner";
import { AreaResolver } from "@/agent-system/gateway/area-resolver";
import { resolveSearchSemantics } from "@/agent-system/gateway/semantic-resolver";
import { managerDecisionSchema, ModelManager } from "@/agent-system/runtime/manager";
import type { ModelContextView } from "@/agent-system/runtime/context-builder";
import { completeAiText } from "@/agent-system/shared/ai/client";
import { getAiConfig } from "@/agent-system/shared/ai/config";
import { emptyWorkingState, type WorkingState } from "@/agent-system/state/working-state";

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

type NormalizedRequest = {
  intent: Record<string, unknown>;
  resolvedFilters: Record<string, unknown>;
};

const genderAliases: Record<string, string> = {
  男: "MALE",
  男性: "MALE",
  女: "FEMALE",
  女性: "FEMALE",
};

function normalizedIntent(request: CapabilityRequest) {
  return Object.fromEntries(Object.entries(request.args).map(([field, argument]) => {
    const operator = "operator" in argument ? argument.operator ?? null : null;
    if (field === "currentLocation" || field === "hometownLocation") {
      return [field, { kind: argument.kind, operator, value: "[resolved-by-area]" }];
    }
    const value = field === "gender" && argument.kind === "exact" && typeof argument.value === "string"
      ? genderAliases[argument.value] ?? argument.value
      : argument.value ?? null;
    return [field, { kind: argument.kind, operator, value }];
  }));
}

async function normalizeRequest(
  request: CapabilityRequest,
  state: WorkingState,
  areas: AreaResolver,
): Promise<NormalizedRequest | null> {
  if (request.capability !== "search_members") {
    return { intent: normalizedIntent(request), resolvedFilters: {} };
  }
  const resolved = await resolveSearchSemantics(request, state, areas);
  if ("status" in resolved) return null;
  // The replay mirrors the Gateway's semantic output and then adds the same
  // search defaults. It intentionally does not invoke the final input schema:
  // Area currently contains variable-length codes, while that legacy schema is
  // still six-digit-only and is tracked as a separate production contract gap.
  return {
    intent: normalizedIntent(request),
    resolvedFilters: {
      ...resolved.args,
      page: Number(resolved.args.page ?? 1),
      pageSize: Number(resolved.args.pageSize ?? 10),
    },
  };
}

function modelWorkingState(state: WorkingState): ModelContextView["working"] {
  return {
    stateVersion: state.stateVersion,
    hasActiveQuery: Boolean(state.activeQuery),
    activeFilters: state.activeQuery?.resolvedFilters ?? null,
    selectedMember: Boolean(state.selectedMemberId),
    clarification: null,
  };
}

function commitReplayQuery(state: WorkingState, request: CapabilityRequest, normalized: NormalizedRequest) {
  if (request.capability === "search_members") {
    state.stateVersion += 1;
    state.activeQuery = {
      queryId: "real-provider-eval-query",
      semanticFilters: request.args,
      resolvedFilters: normalized.resolvedFilters,
      resultRef: "real-provider-eval-result",
      resultMemberIds: [],
      page: Number(normalized.resolvedFilters.page ?? 1),
      pageSize: Number(normalized.resolvedFilters.pageSize ?? 10),
      resultCount: 0,
    };
    state.selectedMemberId = null;
  }
}

async function matchesDecision(
  expected: NonNullable<ReturnType<typeof expectedDecision>>,
  actual: unknown,
  state: WorkingState,
  areas: AreaResolver,
) {
  if (expected.kind === "answer") return { pass: (actual as { kind?: string })?.kind === "answer", normalized: null };
  const parsed = capabilityRequestSchema.safeParse((actual as { request?: unknown })?.request);
  if ((actual as { kind?: string })?.kind !== "capability" || !parsed.success) return { pass: false, normalized: null };
  const [expectedNormalized, actualNormalized] = await Promise.all([
    normalizeRequest(expected.request, state, areas),
    normalizeRequest(parsed.data, state, areas),
  ]);
  if (!expectedNormalized || !actualNormalized) return { pass: false, normalized: actualNormalized };
  return {
    pass:
      parsed.data.capability === expected.request.capability &&
      parsed.data.requestMode === expected.request.requestMode &&
      isDeepStrictEqual(actualNormalized.intent, expectedNormalized.intent) &&
      isDeepStrictEqual(actualNormalized.resolvedFilters, expectedNormalized.resolvedFilters),
    normalized: actualNormalized,
  };
}

describe("Real-provider replay normalization", () => {
  it("stores production-like resolved filters for age and area before a refine turn", async () => {
    const areas = {
      resolve: async (value: string) =>
        value.startsWith("上海")
          ? { code: "3101", name: "上海市", level: "CITY" as const }
          : { status: "ClarificationRequired" as const, message: "unknown area" },
    } as AreaResolver;
    const state = emptyWorkingState();
    const first = capabilityRequestSchema.parse({
      capability: "search_members",
      args: {
        age: { kind: "semantic", operator: "around", concept: "28岁左右", value: 28 },
        currentLocation: { kind: "exact", value: "上海市" },
        gender: { kind: "exact", value: "女性" },
      },
    });
    const normalizedFirst = await normalizeRequest(first, state, areas);
    expect(normalizedFirst).toMatchObject({
      intent: {
        age: { kind: "semantic", operator: "around", value: 28 },
        currentLocation: { kind: "exact", value: "[resolved-by-area]" },
        gender: { kind: "exact", value: "FEMALE" },
      },
      resolvedFilters: { ageMin: 26, ageMax: 30, currentCityCode: "3101", gender: "FEMALE", page: 1, pageSize: 10 },
    });
    if (!normalizedFirst) throw new Error("expected normalized initial request");
    commitReplayQuery(state, first, normalizedFirst);

    const refine = capabilityRequestSchema.parse({
      capability: "search_members",
      requestMode: "refine_query",
      args: { age: { kind: "semantic", operator: "younger" } },
    });
    const normalizedRefine = await normalizeRequest(refine, state, areas);
    expect(normalizedRefine?.resolvedFilters).toMatchObject({
      ageMin: 24,
      ageMax: 28,
      currentCityCode: "3101",
      gender: "FEMALE",
      page: 1,
      pageSize: 10,
    });
  });
});

describe.runIf(enabled)("Phase 1 real-provider manager eval", () => {
  it("replays structured scenarios with full CapabilityRequest argument comparison", async () => {
    const dataset = JSON.parse(await readFile(resolve(process.cwd(), "evals/phase1-backoffice.json"), "utf8")) as Phase1EvalDataset;
    const config = await getAiConfig();
    if (!config.configured || !config.provider) throw new Error("Real-model eval is enabled but the current server-side AI provider is not configured.");

    const manager = new ModelManager((system, content) =>
      completeAiText({ messages: [{ role: "system", content: system }, { role: "user", content }] }, config),
    );
    const areas = new AreaResolver();
    const results: RealEvalResult[] = [];

    for (const scenario of dataset.scenarios) {
      const history: ModelContextView["history"] = [];
      const replayState = emptyWorkingState();

      for (const [index, turn] of scenario.turns.entries()) {
        const expected = expectedDecision(turn);
        const deterministicOnly = turn.managerDecision !== undefined && !expected;
        const view: ModelContextView = { input: turn.input, history: [...history], working: modelWorkingState(replayState), capabilities };
        const started = Date.now();
        let actual: unknown = null;
        let pass = false;
        let normalized: NormalizedRequest | null = null;
        const mode = expected ? "provider" : "server_local";

        if (deterministicOnly) {
          actual = { deterministic_only: true };
          pass = true;
        } else if (expected) {
          try {
            actual = await manager.decide(view);
            const scored = await matchesDecision(expected, actual, replayState, areas);
            pass = scored.pass;
            normalized = scored.normalized;
          } catch (error) {
            actual = { error: error instanceof Error ? error.name : "ProviderError" };
          }
        } else {
          // item-N and selected-member remain server-local: the model never supplies an ID.
          actual = { kind: "server_local", capability: turn.expect.capability ?? null };
          pass = turn.expect.capability === "get_member_profile";
        }

        results.push({ case_id: scenario.id, turn: index + 1, input: turn.input, mode, expected: expected ?? (deterministicOnly ? { deterministic_only: true } : { server_local: turn.expect.capability ?? null }), actual: normalized ? { decision: actual, normalized } : actual, context: { history: view.history, working: view.working }, pass, failure_stage: pass ? null : "Manager", latency_ms: Date.now() - started });
        history.push({ role: "user", content: turn.input });
        history.push({ role: "assistant", content: pass ? "已处理上一轮请求。" : "上一轮请求未通过评估。" });
        if (normalized && expected?.kind === "capability") commitReplayQuery(replayState, expected.request, normalized);
        if (!expected && !deterministicOnly && turn.expect.capability === "get_member_profile") {
          replayState.stateVersion += 1;
          replayState.selectedMemberId = "server-local-selected-member";
        }
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
