import type { CapabilityDefinition } from "../capabilities/registry";
import type { GatewayStop } from "../contracts/gateway-result";
export const riskPolicy = (definition: CapabilityDefinition): GatewayStop | null =>
  definition.sideEffect === "none"
    ? null
    : { status: "PolicyRejected", message: "当前 Runtime 尚未启用有副作用的能力。" };
