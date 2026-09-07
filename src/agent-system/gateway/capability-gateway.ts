import type { CapabilityRegistry } from "../capabilities/registry";
import type { GatewayResult } from "../contracts/gateway-result";
import type { ResolvedAction } from "../contracts/resolved-action";
import type { RuntimeContext } from "../runtime/runtime-context";
import type { WorkingState } from "../state/working-state";
import type { TraceSink } from "../tracing/trace";
import { authorize } from "./authorization";
import { AreaResolver } from "./area-resolver";
import { confirmationPolicy } from "./confirmation-policy";
import { MemberReferenceResolver } from "./member-reference-resolver";
import { modelTrustPolicy } from "./model-trust-policy";
import { riskPolicy } from "./risk-policy";
import { validateRequest } from "./schema-validator";
import { resolveSearchSemantics } from "./semantic-resolver";

export class CapabilityGateway {
  private issued = new WeakMap<object, string>();
  constructor(
    private registry: CapabilityRegistry,
    private trace: TraceSink,
    private areas = new AreaResolver(),
    private references = new MemberReferenceResolver(),
  ) {}

  async resolve(input: unknown, context: RuntimeContext, state: WorkingState): Promise<GatewayResult> {
    const parsed = validateRequest(input);
    this.trace.record(context.traceId, "schema_validation", parsed.success);
    if (!parsed.success) return { status: "ValidationError", message: "能力请求格式无效。" };

    const request = parsed.data;
    const definition = this.registry.get(request.capability);
    if (!definition || !definition.enabled) {
      return { status: "ValidationError", message: "该能力未注册或未启用。" };
    }
    if (!definition.allowedModes.includes(request.requestMode)) {
      return { status: "ValidationError", message: "该能力不支持当前请求模式。" };
    }
    if (Object.keys(request.args).some((key) => !Object.hasOwn(definition.argumentHints, key))) {
      return { status: "ValidationError", message: "请求包含未声明参数。" };
    }

    const authorization = authorize(definition, context);
    this.trace.record(context.traceId, "authorization", authorization?.status ?? "passed");
    if (authorization) return authorization;

    let resolvedArgs: Record<string, unknown>;
    if (definition.name === "search_members") {
      const resolved = await resolveSearchSemantics(request, state, this.areas);
      this.trace.record(context.traceId, "semantic_resolution", resolved);
      if ("status" in resolved) return resolved;
      resolvedArgs = resolved.args;
    } else if (definition.name === "get_member_profile") {
      const resolved = await this.references.resolve(request, state, context);
      this.trace.record(context.traceId, "member_reference_resolution", resolved);
      if ("status" in resolved) return resolved;
      resolvedArgs = resolved;
    } else {
      return { status: "ValidationError", message: "该能力没有已注册的解析器。" };
    }

    const args = definition.inputSchema.safeParse(resolvedArgs);
    if (!args.success) {
      return { status: "ValidationError", message: "查询参数类型、范围或组合无效。" };
    }
    for (const [stage, check] of [
      ["risk", () => riskPolicy(definition)],
      ["confirmation", () => confirmationPolicy(definition)],
      ["model_trust", () => modelTrustPolicy(definition, context)],
    ] as const) {
      const stop = check();
      this.trace.record(context.traceId, stage, stop?.status ?? "passed");
      if (stop) return stop;
    }

    const action = deepFreeze({
      capability: definition.name,
      args: args.data,
      requestId: context.traceId,
      sessionId: context.sessionId,
      operatorId: context.operatorId,
      storeId: context.storeId!,
      stateVersion: state.stateVersion,
      requestMode: request.requestMode,
      policyVersion: "phase1-v1.2",
    }) as ResolvedAction;
    this.issued.set(action, context.trustZone);
    this.trace.record(context.traceId, "resolved_action", {
      capability: action.capability,
      requestMode: action.requestMode,
      stateVersion: action.stateVersion,
      argumentNames: Object.keys(action.args),
    });
    return { status: "ResolvedAction", action };
  }

  consume(action: ResolvedAction, context: RuntimeContext) {
    if (
      this.issued.get(action) !== context.trustZone ||
      action.requestId !== context.traceId ||
      action.sessionId !== context.sessionId ||
      action.operatorId !== context.operatorId ||
      action.storeId !== context.storeId
    ) {
      throw new Error("Unapproved action");
    }
    this.issued.delete(action);
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
