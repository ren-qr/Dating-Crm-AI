import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { capabilityRequestSchema } from "@/agent-system/contracts/capability-request";
import type { Phase1EvalDataset } from "@/agent-system/eval/phase1-runner";
import { ModelManager } from "@/agent-system/runtime/manager";
import { completeAiText } from "@/agent-system/shared/ai/client";
import { getAiConfig } from "@/agent-system/shared/ai/config";

const enabled = process.env.AGENT_REAL_EVAL_ENABLED === "1";

describe.runIf(enabled)("Phase 1 real-provider manager eval", () => {
  it("calls the configured provider through the production abstraction and records structured results", async () => {
    const dataset = JSON.parse(
      await readFile(resolve(process.cwd(), "evals/phase1-backoffice.json"), "utf8"),
    ) as Phase1EvalDataset;
    const config = await getAiConfig();
    if (!config.configured || !config.provider) {
      throw new Error("Real-model eval is enabled but the current server-side AI provider is not configured.");
    }

    const manager = new ModelManager((system, content) =>
      completeAiText({ messages: [{ role: "system", content: system }, { role: "user", content }] }, config),
    );
    const cases = dataset.scenarios.flatMap((scenario) =>
      scenario.turns
        .filter((turn) => turn.managerDecision !== undefined)
        .map((turn) => ({ scenario, turn })),
    );
    const results = [] as Array<{
      case_id: string;
      input: string;
      expected: unknown;
      actual: unknown;
      pass: boolean;
      failure_stage: "Manager" | null;
      latency_ms: number;
    }>;

    for (const { scenario, turn } of cases) {
      const started = Date.now();
      let actual: unknown = null;
      let pass = false;
      try {
        actual = await manager.decide({
          input: turn.input,
          history: [],
          working: { stateVersion: 0, hasActiveQuery: false, activeFilters: null, selectedMember: false, clarification: null },
          capabilities: [
            { name: "search_members", description: "按明确条件搜索会员", arguments: { gender: "性别", age: "年龄", currentLocation: "地区" } },
            { name: "get_member_profile", description: "查看已授权会员摘要", arguments: { memberRef: "引用" } },
          ],
        });
        const expected = turn.managerDecision as { kind?: string; request?: { capability?: string; requestMode?: string } };
        const parsed = capabilityRequestSchema.safeParse((actual as { request?: unknown })?.request);
        pass = expected.kind === "answer"
          ? (actual as { kind?: string })?.kind === "answer"
          : (actual as { kind?: string })?.kind === "capability" && parsed.success &&
            parsed.data.capability === expected.request?.capability &&
            parsed.data.requestMode === (expected.request?.requestMode ?? "new_query");
      } catch (error) {
        actual = { error: error instanceof Error ? error.name : "ProviderError" };
      }
      results.push({
        case_id: scenario.id,
        input: turn.input,
        expected: turn.managerDecision,
        actual,
        pass,
        failure_stage: pass ? null : "Manager",
        latency_ms: Date.now() - started,
      });
    }

    const report = {
      schema_version: "phase1-agent-eval-v0.1",
      runner: "real-provider-manager",
      provider: config.provider,
      model: config.model,
      total_cases: results.length,
      passed_cases: results.filter((item) => item.pass).length,
      failed_cases: results.filter((item) => !item.pass).length,
      results,
    };
    const outputDir = process.env.AGENT_EVAL_OUTPUT_DIR ?? resolve(process.cwd(), "evals/results");
    await mkdir(outputDir, { recursive: true });
    await Promise.all([
      writeFile(resolve(outputDir, "phase1-real-provider.latest.json"), `${JSON.stringify(report, null, 2)}\n`),
      writeFile(resolve(outputDir, "phase1-real-provider.latest.md"), [
        "# Phase 1 Real-Provider Eval Summary",
        "",
        `- Provider: ${config.provider}`,
        `- Model: ${config.model}`,
        `- Cases: ${report.total_cases}`,
        `- Passed: ${report.passed_cases}`,
        `- Failed: ${report.failed_cases}`,
        "",
      ].join("\n")),
    ]);

    expect(report.failed_cases).toBe(0);
  }, 180_000);
});
