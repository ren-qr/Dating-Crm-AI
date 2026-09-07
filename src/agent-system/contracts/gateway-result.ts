import type { JsonRecord } from "./common-types";
import type { ResolvedAction } from "./resolved-action";

export type Clarification = {
  id?: string;
  field: string;
  reason: string;
  question: string;
  options: Array<{ id: string; label: string }>;
};
export type GatewayStopStatus =
  | "ClarificationRequired"
  | "ValidationError"
  | "AuthorizationDenied"
  | "ConfirmationRequired"
  | "PolicyRejected"
  | "NotFound";
export type GatewayStop = {
  status: GatewayStopStatus;
  message: string;
  clarification?: Clarification;
  details?: JsonRecord;
};
export type GatewayResult = GatewayStop | { status: "ResolvedAction"; action: ResolvedAction };
