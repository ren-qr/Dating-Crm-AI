import type { CapabilityDefinition } from "../capabilities/registry";
import type { RuntimeContext } from "../runtime/runtime-context";
import type { GatewayStop } from "../contracts/gateway-result";
export const modelTrustPolicy = (
  definition: CapabilityDefinition,
  context: RuntimeContext,
): GatewayStop | null =>
  definition.trust.includes(context.trustZone)
    ? null
    : { status: "PolicyRejected", message: "当前模型信任区不允许使用此能力。" };
