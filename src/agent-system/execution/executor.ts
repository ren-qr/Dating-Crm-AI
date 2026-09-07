import type { CapabilityRegistry, RawResult } from "../capabilities/registry";
import type { ResolvedAction } from "../contracts/resolved-action";
import type { RuntimeContext } from "../runtime/runtime-context";
import type { CapabilityGateway } from "../gateway/capability-gateway";

export type CapabilityAdapter = (
  action: ResolvedAction,
  context: RuntimeContext,
) => Promise<RawResult>;
export class Executor {
  constructor(
    private registry: CapabilityRegistry,
    private gateway: CapabilityGateway,
    private adapters: Record<string, CapabilityAdapter>,
  ) {}
  async execute(action: ResolvedAction, context: RuntimeContext): Promise<RawResult> {
    this.gateway.consume(action, context);
    const adapter = this.adapters[action.capability];
    const definition = this.registry.get(action.capability);
    if (!adapter || !definition) throw new Error("Capability executor unavailable");
    return definition.outputSchema.parse(await adapter(action, context)) as RawResult;
  }
}
