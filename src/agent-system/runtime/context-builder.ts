import type { CapabilityRegistry } from "../capabilities/registry";
import type { RuntimeContext } from "./runtime-context";
import type { LoadedState } from "../state/state-store";
import type { SafeResult } from "../contracts/safe-result";
import { assertSafeResult } from "../result/result-policy";
import { redactSensitiveText } from "../shared/ai/privacy";
import { authorize } from "../gateway/authorization";
import { modelTrustPolicy } from "../gateway/model-trust-policy";

export type ModelContextView = {
  input: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  working: {
    stateVersion: number;
    hasActiveQuery: boolean;
    activeFilters: Record<string, unknown> | null;
    selectedMember: boolean;
    clarification: { id: string; field: string; question: string; options: Array<{ id: string; label: string }> } | null;
  };
  capabilities: Array<{ name: string; description: string; arguments: Record<string, string> }>;
  result?: SafeResult["data"];
};
export interface ContextBuilder {
  build(
    input: string,
    state: LoadedState,
    context: RuntimeContext,
    result?: SafeResult,
  ): ModelContextView;
}
export class MinimalContextBuilder implements ContextBuilder {
  constructor(private registry: CapabilityRegistry) {}
  build(
    input: string,
    state: LoadedState,
    context: RuntimeContext,
    result?: SafeResult,
  ): ModelContextView {
    if (result) assertSafeResult(result, context);
    return {
      input: redactSensitiveText(input).slice(0, 2000),
      history: state.log
        .filter((event) => event.type === "user_message" || event.type === "assistant_message")
        .slice(-6)
        .map((event) => ({
          role: event.type === "user_message" ? "user" : "assistant",
          content: redactSensitiveText(event.text ?? "").slice(0, 1000),
        })),
      working: {
        stateVersion: state.working.stateVersion,
        hasActiveQuery: Boolean(state.working.activeQuery),
        activeFilters: state.working.activeQuery?.resolvedFilters ?? null,
        selectedMember: Boolean(state.working.selectedMemberId),
        clarification: state.working.pendingClarification
          ? {
              id: state.working.pendingClarification.id,
              field: state.working.pendingClarification.field,
              question: state.working.pendingClarification.message,
              options: [],
            }
          : null,
      },
      capabilities: this.registry
        .list()
        .filter(
          (definition) => !authorize(definition, context) && !modelTrustPolicy(definition, context),
        )
        .map((definition) => ({
          name: definition.name,
          description: definition.description,
          arguments: definition.argumentHints,
        })),
      ...(result ? { result: result.data } : {}),
    };
  }
}
