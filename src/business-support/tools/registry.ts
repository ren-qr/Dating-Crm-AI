import { getMemberMatePreference, getMemberProfile, searchMembers } from "@/business-support/tools/member";

/** @deprecated Legacy function catalog; the new Runtime owns its CapabilityRegistry. */
export const toolRegistry = {
  get_member_profile: getMemberProfile,
  search_members: searchMembers,
  get_member_mate_preference: getMemberMatePreference,
} as const;

export type ToolName = keyof typeof toolRegistry;
