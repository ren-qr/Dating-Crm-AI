import { searchMembers } from "@/business-support/tools/member";
import { searchInputSchema } from "../../capabilities/tools/search-members";
import type { CapabilityAdapter } from "../executor";

export const searchMembersAdapter: CapabilityAdapter = async (action, context) => {
  const result = await searchMembers(
    { auth: context.auth, memberOwnerId: context.operatorId },
    searchInputSchema.parse(action.args),
  );
  return {
    rows: result.items.map((data) => ({
      storeId: action.storeId,
      ownerId: context.operatorId,
      data,
    })),
    meta: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      hasNext: result.hasNext,
    },
  };
};
