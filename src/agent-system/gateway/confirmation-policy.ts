import type { CapabilityDefinition } from "../capabilities/registry";
import type { GatewayStop } from "../contracts/gateway-result";
export const confirmationPolicy = (definition: CapabilityDefinition): GatewayStop | null =>
  definition.confirmation === "never"
    ? null
    : { status: "ConfirmationRequired", message: "此能力需要确认；确认令牌及恢复执行尚未启用。" };
