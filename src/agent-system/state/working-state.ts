import type { CapabilityRequest } from "../contracts/capability-request";
import type { JsonRecord } from "../contracts/common-types";

export type ActiveQuery = {
  queryId: string;
  semanticFilters: CapabilityRequest["args"];
  resolvedFilters: JsonRecord;
  resultRef: string;
  resultMemberIds: string[];
  page: number;
  pageSize: number;
  resultCount: number;
};
export type PendingClarification = {
  id: string;
  request: CapabilityRequest;
  field: string;
  reason: string;
  message: string;
  stateVersion: number;
};
export type WorkingState = {
  stateVersion: number;
  activeQuery: ActiveQuery | null;
  selectedMemberId: string | null;
  pendingClarification: PendingClarification | null;
};
export const emptyWorkingState = (): WorkingState => ({
  stateVersion: 0,
  activeQuery: null,
  selectedMemberId: null,
  pendingClarification: null,
});
