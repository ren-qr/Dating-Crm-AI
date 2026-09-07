import type { CapabilityRequest } from "../contracts/capability-request";
import { CapabilityRegistry, type RawResult } from "../capabilities/registry";
import { getMemberProfileCapability } from "../capabilities/tools/get-member-profile";
import { searchCapability } from "../capabilities/tools/search-members";
import { AgentLoop, type TurnResult } from "../runtime/agent-loop";
import type { Manager } from "../runtime/manager";
import type { RuntimeContext } from "../runtime/runtime-context";
import { MemoryStateStore } from "../state/state-store";
import { MemoryAudit } from "../tracing/audit";
import { MemoryEval } from "../tracing/eval-hooks";
import { MemoryTrace } from "../tracing/trace";

export type EvalExpectation = {
  status: string;
  capability?: "search_members" | "get_member_profile" | null;
  args?: Record<string, unknown>;
  clarificationField?: string;
  hasActiveQuery?: boolean;
  selectedMember?: boolean;
  displayType?: "member_list" | "member_profile";
  managerCalled?: boolean;
  errorName?: string;
};

export type EvalTurn = {
  input: string;
  managerDecision?: unknown;
  expect: EvalExpectation;
  trustZone?: "cloud" | "local";
  permissions?: string[];
  contextOverride?: Partial<Pick<RuntimeContext, "operatorId" | "storeId" | "sessionId" | "trustZone">>;
  clarification?: "previous" | "stale";
  clarificationAnswer?: string;
  adapterFailure?: boolean;
};

export type EvalScenario = {
  id: string;
  title: string;
  turns: EvalTurn[];
};

export type Phase1EvalDataset = {
  schemaVersion: "phase1-agent-eval-v0.1";
  scenarios: EvalScenario[];
};

export type EvalTurnResult = {
  input: string;
  expected: EvalExpectation;
  actual: {
    status: string | null;
    capability: string | null;
    args: Record<string, unknown> | null;
    clarificationField: string | null;
    hasActiveQuery: boolean | null;
    selectedMember: boolean | null;
    displayType: string | null;
    managerCalled: boolean;
    errorName: string | null;
  };
  pass: boolean;
  failure_stage: FailureStage | null;
  failure_reason: string | null;
  latency_ms: number;
};

export type FailureStage =
  | "Manager"
  | "Schema"
  | "Gateway"
  | "Resolver"
  | "Executor"
  | "ResultPolicy"
  | "State"
  | "UI";

export type EvalScenarioResult = {
  case_id: string;
  title: string;
  turns: EvalTurnResult[];
  pass: boolean;
};

export type Phase1EvalReport = {
  schema_version: "phase1-agent-eval-v0.1";
  runner: "deterministic-runtime";
  generated_at: string;
  total_scenarios: number;
  total_turns: number;
  passed_turns: number;
  failed_turns: number;
  security_total: number;
  security_passed: number;
  failure_categories: Record<string, number>;
  scenarios: EvalScenarioResult[];
};

type AdapterCall = { capability: string; args: Record<string, unknown>; context: RuntimeContext };

const memberRows = Array.from({ length: 15 }, (_, index) => ({
  storeId: "store-a",
  ownerId: "employee-a",
  data: {
    memberId: `member-${index + 1}`,
    name: index === 0 ? "王晓明" : `合成会员${index + 1}`,
    age: 24 + (index % 8),
    gender: index % 2 === 0 ? "FEMALE" : "MALE",
    occupation: index % 3 === 0 ? "教师" : "工程师",
    education: index % 2 === 0 ? "硕士" : "本科",
    currentLocation: { province: "310000", city: "310100", district: null },
  },
}));

function rawRows(rows = memberRows): RawResult {
  return {
    rows,
    meta: { page: 1, pageSize: 15, total: rows.length, hasNext: false },
  };
}

class ScriptedManager implements Manager {
  readonly decisions: unknown[];
  decideCalls = 0;

  constructor(decisions: unknown[]) {
    this.decisions = [...decisions];
  }

  async decide() {
    this.decideCalls += 1;
    return this.decisions.shift() ?? { kind: "answer", text: "请补充查询条件。" };
  }

  async respond() {
    return "确定性评估回复。";
  }
}

function runtimeContext(turn: EvalTurn, scenarioIndex: number): RuntimeContext {
  const trustZone = turn.contextOverride?.trustZone ?? turn.trustZone ?? "cloud";
  const operatorId = turn.contextOverride?.operatorId ?? "employee-a";
  const storeId = turn.contextOverride?.storeId ?? "store-a";
  return {
    auth: {
      employee: {
        employeeId: operatorId,
        storeId,
        email: "eval@example.test",
        name: "评估员工",
        roleCodes: ["consultant"],
        roleLevel: "staff",
        roleName: "员工",
        permissions: turn.permissions ?? ["member:read"],
      },
      employeeStoreId: storeId,
      isBootstrapAdmin: false,
    },
    operatorId,
    storeId,
    sessionId: turn.contextOverride?.sessionId ?? `eval-session-${scenarioIndex}`,
    traceId: crypto.randomUUID(),
    trustZone,
  };
}

function stageFor(result: TurnResult | null, error: unknown): FailureStage {
  if (error && error instanceof Error && /State/.test(error.name)) return "State";
  if (result?.status === "Failed") return "Executor";
  if (result?.status === "ValidationError") return "Schema";
  if (result?.status === "AuthorizationDenied" || result?.status === "PolicyRejected") return "Gateway";
  if (result?.status === "ClarificationRequired" || result?.status === "NotFound") return "Resolver";
  return "Manager";
}

function matches(expected: EvalExpectation, actual: EvalTurnResult["actual"]): string | null {
  if (expected.status !== actual.status) return `status expected ${expected.status}, got ${actual.status}`;
  if (expected.capability !== undefined && expected.capability !== actual.capability) return `capability expected ${expected.capability}, got ${actual.capability}`;
  if (expected.clarificationField !== undefined && expected.clarificationField !== actual.clarificationField) return `clarificationField expected ${expected.clarificationField}, got ${actual.clarificationField}`;
  if (expected.hasActiveQuery !== undefined && expected.hasActiveQuery !== actual.hasActiveQuery) return `hasActiveQuery expected ${expected.hasActiveQuery}, got ${actual.hasActiveQuery}`;
  if (expected.selectedMember !== undefined && expected.selectedMember !== actual.selectedMember) return `selectedMember expected ${expected.selectedMember}, got ${actual.selectedMember}`;
  if (expected.displayType !== undefined && expected.displayType !== actual.displayType) return `displayType expected ${expected.displayType}, got ${actual.displayType}`;
  if (expected.managerCalled !== undefined && expected.managerCalled !== actual.managerCalled) return `managerCalled expected ${expected.managerCalled}, got ${actual.managerCalled}`;
  if (expected.errorName !== undefined && expected.errorName !== actual.errorName) return `errorName expected ${expected.errorName}, got ${actual.errorName}`;
  for (const [key, value] of Object.entries(expected.args ?? {})) {
    if (!actual.args || actual.args[key] !== value) return `argument ${key} expected ${String(value)}, got ${String(actual.args?.[key])}`;
  }
  return null;
}

/**
 * Executes the production AgentLoop with scripted Manager decisions. It never uses
 * a provider or a real member record; Prisma-backed resolvers are mocked by its test
 * host while adapters remain normal AgentLoop adapters.
 */
export async function runPhase1DeterministicEval(dataset: Phase1EvalDataset): Promise<Phase1EvalReport> {
  const scenarios: EvalScenarioResult[] = [];

  for (const [scenarioIndex, scenario] of dataset.scenarios.entries()) {
    const calls: AdapterCall[] = [];
    const failures = new Set<number>();
    const manager = new ScriptedManager(scenario.turns.map((turn) => turn.managerDecision));
    const registry = new CapabilityRegistry([searchCapability, getMemberProfileCapability]);
    const state = new MemoryStateStore();
    const loop = new AgentLoop({
      registry,
      state,
      trace: new MemoryTrace(),
      audit: new MemoryAudit(),
      evalHooks: new MemoryEval(),
      adapters: {
        search_members: async (action, context) => {
          calls.push({ capability: action.capability, args: action.args, context });
          if (failures.has(calls.length - 1)) throw new Error("eval adapter failure");
          return rawRows();
        },
        get_member_profile: async (action, context) => {
          calls.push({ capability: action.capability, args: action.args, context });
          if (failures.has(calls.length - 1)) throw new Error("eval adapter failure");
          const memberId = String(action.args.memberId);
          return rawRows(memberRows.filter((row) => row.data.memberId === memberId));
        },
      },
    });
    let previousClarificationId: string | undefined;
    const turns: EvalTurnResult[] = [];

    for (const turn of scenario.turns) {
      const beforeCalls = calls.length;
      const beforeManagerCalls = manager.decideCalls;
      if (turn.adapterFailure) failures.add(beforeCalls);
      const context = runtimeContext(turn, scenarioIndex);
      const started = Date.now();
      let result: TurnResult | null = null;
      let thrown: unknown = null;
      try {
        result = await loop.run(
          {
            message: turn.input,
            ...(turn.clarification === "previous" ? { clarificationId: previousClarificationId, clarificationAnswer: turn.clarificationAnswer ?? "确认" } : {}),
            ...(turn.clarification === "stale" ? { clarificationId: crypto.randomUUID(), clarificationAnswer: turn.clarificationAnswer ?? "确认" } : {}),
          },
          context,
          manager,
        );
      } catch (error) {
        thrown = error;
      }
      previousClarificationId = result?.clarification?.id ?? previousClarificationId;
      const call = calls.at(-1);
      const didExecute = calls.length > beforeCalls;
      const actual = {
        status: result?.status ?? (thrown instanceof Error ? thrown.name : null),
        capability: didExecute ? call?.capability ?? null : null,
        args: didExecute ? call?.args ?? null : null,
        clarificationField: result?.clarification?.field ?? null,
        hasActiveQuery: result?.state.hasActiveQuery ?? null,
        selectedMember: result?.state.selectedMember ?? null,
        displayType: result?.displayResult?.type ?? null,
        managerCalled: manager.decideCalls > beforeManagerCalls,
        errorName: thrown instanceof Error ? thrown.name : null,
      };
      const failureReason = matches(turn.expect, actual);
      const pass = !failureReason;
      turns.push({
        input: turn.input,
        expected: turn.expect,
        actual,
        pass,
        failure_stage: pass ? null : stageFor(result, thrown),
        failure_reason: failureReason,
        latency_ms: Date.now() - started,
      });
    }
    scenarios.push({ case_id: scenario.id, title: scenario.title, turns, pass: turns.every((turn) => turn.pass) });
  }

  const flat = scenarios.flatMap((scenario) => scenario.turns);
  const failureCategories = flat
    .filter((turn) => !turn.pass)
    .reduce<Record<string, number>>((all, turn) => {
      const category = turn.failure_stage ?? "Unknown";
      all[category] = (all[category] ?? 0) + 1;
      return all;
    }, {});
  const security = scenarios.filter((scenario) => /^T(?:25|26|27|28|29|30|31|32|33|36|37|38|39|40|41|42|50)$/u.test(scenario.case_id));
  return {
    schema_version: "phase1-agent-eval-v0.1",
    runner: "deterministic-runtime",
    generated_at: new Date().toISOString(),
    total_scenarios: scenarios.length,
    total_turns: flat.length,
    passed_turns: flat.filter((turn) => turn.pass).length,
    failed_turns: flat.filter((turn) => !turn.pass).length,
    security_total: security.flatMap((scenario) => scenario.turns).length,
    security_passed: security.flatMap((scenario) => scenario.turns).filter((turn) => turn.pass).length,
    failure_categories: failureCategories,
    scenarios,
  };
}

export function renderPhase1EvalSummary(report: Phase1EvalReport): string {
  const failures = report.scenarios.flatMap((scenario) => scenario.turns.map((turn, index) => ({ scenario, turn, index }))).filter(({ turn }) => !turn.pass);
  return [
    "# Phase 1 Agent Eval Summary",
    "",
    `- Runner: ${report.runner}`,
    `- Scenarios: ${report.total_scenarios}`,
    `- Turns: ${report.total_turns}`,
    `- Passed: ${report.passed_turns}`,
    `- Failed: ${report.failed_turns}`,
    `- Security: ${report.security_passed}/${report.security_total}`,
    "",
    "## Failure Categories",
    "",
    ...(Object.keys(report.failure_categories).length
      ? Object.entries(report.failure_categories).map(([stage, count]) => `- ${stage}: ${count}`)
      : ["- None"]),
    "",
    "## Failed Turns",
    "",
    ...(failures.length
      ? failures.map(({ scenario, turn, index }) => `- ${scenario.case_id} turn ${index + 1}: ${turn.failure_stage} - ${turn.failure_reason}`)
      : ["- None"]),
    "",
  ].join("\n");
}

export function capabilityDecision(capability: CapabilityRequest["capability"], args: CapabilityRequest["args"], requestMode: CapabilityRequest["requestMode"] = "new_query") {
  return { kind: "capability", request: { capability, requestMode, args } };
}
