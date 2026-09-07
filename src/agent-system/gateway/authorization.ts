import { hasPermission } from "@/business-support/permissions/permissions";
import type { CapabilityDefinition } from "../capabilities/registry";
import type { RuntimeContext } from "../runtime/runtime-context";
import type { GatewayStop } from "../contracts/gateway-result";

export function authorize(
  definition: CapabilityDefinition,
  context: RuntimeContext,
): GatewayStop | null {
  if (
    !context.storeId ||
    !hasPermission(context.auth.employee.permissions, definition.requiredPermission)
  ) {
    return { status: "AuthorizationDenied", message: "缺少所需权限或有效门店上下文。" };
  }
  return null;
}
