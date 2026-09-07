import type { CapabilityRegistry, RawResult } from "../capabilities/registry";
import { capabilityRequestSchema, type CapabilityRequest } from "../contracts/capability-request";
import type { AuthorizedDisplayResult } from "../contracts/authorized-display-result";
import type { Clarification } from "../contracts/gateway-result";
import { CapabilityGateway } from "../gateway/capability-gateway";
import { Executor, type CapabilityAdapter } from "../execution/executor";
import { applyResultPolicy, buildAuthorizedDisplayResult, scopedRows } from "../result/result-policy";
import type { StateStore, LoadedState } from "../state/state-store";
import type { SessionEvent } from "../state/session-log";
import type { TraceSink } from "../tracing/trace";
import type { AuditSink } from "../tracing/audit";
import type { EvalHooks } from "../tracing/eval-hooks";
import type { RuntimeContext } from "./runtime-context";
import { managerDecisionSchema, type Manager } from "./manager";
import { MinimalContextBuilder } from "./context-builder";
import { redactSensitiveText, scanModelText } from "../shared/ai/privacy";

export type RuntimeTurnInput = {
  message: string;
  clarificationId?: string;
  clarificationAnswer?: string;
};
export type PublicWorkingState = {
  stateVersion: number;
  activeFilters: Record<string, unknown> | null;
  hasActiveQuery: boolean;
  selectedMember: boolean;
};
export type TurnResult = {
  status: string;
  text: string;
  conversationId: string;
  traceId: string;
  state: PublicWorkingState;
  displayResult?: AuthorizedDisplayResult;
  clarification?: Clarification;
};
export type RuntimeDependencies = {
  registry: CapabilityRegistry;
  adapters: Record<string, CapabilityAdapter>;
  state: StateStore;
  trace: TraceSink;
  audit: AuditSink;
  evalHooks: EvalHooks;
};

export class AgentLoop {
  private gateway: CapabilityGateway;
  private executor: Executor;
  private builder: MinimalContextBuilder;
  constructor(private dependencies: RuntimeDependencies) {
    this.gateway = new CapabilityGateway(dependencies.registry, dependencies.trace);
    this.executor = new Executor(dependencies.registry, this.gateway, dependencies.adapters);
    this.builder = new MinimalContextBuilder(dependencies.registry);
  }

  async run(input: RuntimeTurnInput, context: RuntimeContext, manager: Manager): Promise<TurnResult> {
    return this.dependencies.state.withState(context, async (state) => {
      const started = Date.now();
      let status = "Failed";
      let capability = "none";
      const trace = (stage: string, value: unknown) => this.dependencies.trace.record(context.traceId, stage, value);
      const event = (type: SessionEvent["type"], text?: string) =>
        state.log.push({
          id: crypto.randomUUID(), traceId: context.traceId, at: new Date().toISOString(), type,
          ...(text ? { text: redactSensitiveText(text) } : {}),
        });
      const publicState = (): PublicWorkingState => ({
        stateVersion: state.working.stateVersion,
        activeFilters: state.working.activeQuery?.resolvedFilters ?? null,
        hasActiveQuery: Boolean(state.working.activeQuery),
        selectedMember: Boolean(state.working.selectedMemberId),
      });
      const finish = (nextStatus: string, text: string, extra: Pick<TurnResult, "displayResult" | "clarification"> = {}): TurnResult => {
        status = nextStatus;
        const safeText = redactSensitiveText(text).slice(0, 4000);
        event("assistant_message", safeText);
        trace("response", { status: nextStatus, length: safeText.length });
        return { status, text: safeText, conversationId: context.sessionId, traceId: context.traceId, state: publicState(), ...extra };
      };
      try {
        if (state.log.length > 500) return finish("PolicyRejected", "开发会话已达到容量上限，请开启新会话。");
        trace("state_loaded", { eventCount: state.log.length, stateVersion: state.working.stateVersion, hasQuery: Boolean(state.working.activeQuery) });

        if (isClearCommand(input.message)) {
          state.working.activeQuery = null;
          state.working.selectedMemberId = null;
          state.working.pendingClarification = null;
          state.working.stateVersion += 1;
          event("user_message", "[清除查询条件]");
          return finish("Completed", "已清除当前查询条件。");
        }

        const request = await this.requestForTurn(input, state, context, manager, trace);
        event("user_message", safeEventInput(input.message, context));
        if ("result" in request) return finish(request.result.status, request.result.text, request.result.extra);
        capability = request.capability;
        const gatewayResult = await this.gateway.resolve(request, context, state.working);
        event("gateway_decision", gatewayResult.status);
        trace("gateway_result", gatewayResult.status === "ResolvedAction" ? { status: gatewayResult.status, capability } : { status: gatewayResult.status, message: gatewayResult.message });
        if (gatewayResult.status !== "ResolvedAction") {
          if (gatewayResult.status === "ClarificationRequired") {
            const clarification = { id: crypto.randomUUID(), ...(gatewayResult.clarification ?? { field: "query", reason: "missing", question: gatewayResult.message, options: [] }) };
            state.working.pendingClarification = { id: clarification.id, request, field: clarification.field, reason: clarification.reason, message: clarification.question, stateVersion: state.working.stateVersion };
            return finish(gatewayResult.status, gatewayResult.message, { clarification });
          }
          return finish(gatewayResult.status, gatewayResult.message, gatewayResult.clarification ? { clarification: gatewayResult.clarification } : {});
        }

        const raw = await this.executor.execute(gatewayResult.action, context);
        trace("executed", { rowCount: raw.rows.length, meta: raw.meta });
        const definition = this.dependencies.registry.get(capability)!;
        const safe = applyResultPolicy(raw, definition, context, this.dependencies.trace);
        const resultRef = `${capability === "search_members" ? "query" : "profile"}-${crypto.randomUUID()}`;
        const displayResult = buildAuthorizedDisplayResult(raw, context, resultRef, capability === "search_members" ? "member_list" : "member_profile");
        commitWorkingState(state, request, gatewayResult.action.args, raw, context, resultRef);
        const answer = await manager.respond(this.builder.build(input.message, state, context, safe));
        return finish("Completed", answer, { displayResult });
      } catch (error) {
        event("error", error instanceof Error ? error.name : "RuntimeError");
        trace("error", error instanceof Error ? error.name : "RuntimeError");
        return finish("Failed", "本次处理未完成，请重试；系统没有执行自动重试。");
      } finally {
        await this.dependencies.audit.record({ traceId: context.traceId, operatorId: context.operatorId, capability, outcome: status, at: new Date().toISOString() });
        this.dependencies.evalHooks.onTurn({ traceId: context.traceId, status, durationMs: Date.now() - started });
        trace("state_updated", { stateVersion: state.working.stateVersion, hasQuery: Boolean(state.working.activeQuery), selectedMember: Boolean(state.working.selectedMemberId) });
      }
    });
  }

  private async requestForTurn(
    input: RuntimeTurnInput, state: LoadedState, context: RuntimeContext, manager: Manager,
    trace: (stage: string, value: unknown) => void,
  ): Promise<CapabilityRequest | { result: { status: string; text: string; extra: Pick<TurnResult, "displayResult" | "clarification"> } }> {
    const pending = state.working.pendingClarification;
    if (input.clarificationId || input.clarificationAnswer) {
      if (!pending || input.clarificationId !== pending.id || !input.clarificationAnswer?.trim()) {
        return { result: { status: "PolicyRejected", text: "该补充信息已失效，请重新发起查询。", extra: {} } };
      }
      state.working.pendingClarification = null;
      return withClarificationAnswer(pending.request, pending.field, input.clarificationAnswer.trim());
    }

    const localRequest = directProfileRequest(input.message, state);
    const privacy = scanModelText(input.message);
    if (context.trustZone === "cloud" && !privacy.safe && !localRequest) {
      return { result: { status: "PolicyRejected", text: "该请求包含不能发送给云端模型的敏感信息，请通过会员列表或本地模型继续。", extra: {} } };
    }
    if (localRequest) return localRequest;
    const view = this.builder.build(input.message, state, context);
    trace("context_built", { capabilities: view.capabilities.map((item) => item.name), stateVersion: view.working.stateVersion });
    const decision = managerDecisionSchema.safeParse(await manager.decide(view));
    if (!decision.success) return { result: { status: "ValidationError", text: "模型返回的请求格式无效，未执行任何查询。", extra: {} } };
    trace("manager_decision", decision.data.kind === "capability" ? { kind: "capability", capability: decision.data.request.capability } : { kind: "answer" });
    if (decision.data.kind === "answer") return { result: { status: "Answered", text: decision.data.text, extra: {} } };
    return capabilityRequestSchema.parse(decision.data.request);
  }
}

function commitWorkingState(state: LoadedState, request: CapabilityRequest, args: Record<string, unknown>, raw: RawResult, context: RuntimeContext, resultRef: string) {
  state.working.pendingClarification = null;
  state.working.stateVersion += 1;
  if (request.capability === "search_members") {
    const rows = scopedRows(raw, context);
    state.working.activeQuery = {
      queryId: crypto.randomUUID(), semanticFilters: request.args, resolvedFilters: args, resultRef,
      resultMemberIds: rows.map((row) => String(row.data.memberId)).filter(Boolean),
      page: Number(args.page ?? 1), pageSize: Number(args.pageSize ?? 10), resultCount: rows.length,
    };
    state.working.selectedMemberId = null;
  } else if (request.capability === "get_member_profile") {
    state.working.selectedMemberId = String(args.memberId);
  }
}

function withClarificationAnswer(request: CapabilityRequest, field: string, answer: string): CapabilityRequest {
  return capabilityRequestSchema.parse({ ...request, args: { ...request.args, [field]: { kind: "exact", value: answer } } });
}
function isClearCommand(message: string) { return /^(清空条件|清除筛选|清空筛选)$/u.test(message.trim()); }
function safeEventInput(message: string, context: RuntimeContext) {
  return context.trustZone === "cloud" && directProfileRequest(message) ? "[服务器解析的会员定位请求]" : message;
}
function directProfileRequest(message: string, state?: LoadedState): CapabilityRequest | null {
  const memberNo = /(?:会员编号|编号)\s*[:：]?\s*([A-Za-z0-9_-]{2,80})/u.exec(message)?.[1];
  if (memberNo) return capabilityRequestSchema.parse({ capability: "get_member_profile", args: { memberNo: { kind: "exact", value: memberNo } } });
  const name = /(?:查一下|查看|打开|看看)\s*([\u4E00-\u9FFF]{2,8})(?:的?(?:资料|详情|情况))?$/u.exec(message.trim())?.[1];
  if (name) return capabilityRequestSchema.parse({ capability: "get_member_profile", args: { memberName: { kind: "exact", value: name } } });
  const item = /第\s*([1-9]\d?)\s*(?:个|位)?(?:看看|查看|详情|资料|详细情况)?/u.exec(message)?.[1];
  if (item) return capabilityRequestSchema.parse({ capability: "get_member_profile", args: { memberRef: { kind: "reference", ref: "result_item", value: Number(item) } } });
  if (/(?:她|他|刚才那个|这个)(?:的)?(?:资料|详情|详细情况)/u.test(message) && state?.working.selectedMemberId) {
    return capabilityRequestSchema.parse({ capability: "get_member_profile", args: { memberRef: { kind: "reference", ref: "selected_member" } } });
  }
  return null;
}
