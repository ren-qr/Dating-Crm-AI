import type { JsonRecord } from "./common-types";

declare const resolvedBrand: unique symbol;
export type ResolvedAction = Readonly<{
  [resolvedBrand]: true;
  capability: string;
  args: JsonRecord;
  requestId: string;
  sessionId: string;
  operatorId: string;
  storeId: string;
  stateVersion: number;
  requestMode: "new_query" | "refine_query" | "paginate_query";
  policyVersion: string;
}>;
