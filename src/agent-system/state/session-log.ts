export type SessionEvent = {
  id: string;
  traceId: string;
  at: string;
  type:
    | "user_message"
    | "assistant_message"
    | "capability_request"
    | "gateway_decision"
    | "safe_result_ref"
    | "clarification"
    | "state_reset"
    | "error";
  text?: string;
};
export type SessionLog = SessionEvent[];
