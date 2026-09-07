import { getMemberProfile } from "@/business-support/tools/member";
import type { CapabilityAdapter } from "../executor";

export const getMemberProfileAdapter: CapabilityAdapter = async (action, context) => {
  const profile = await getMemberProfile(
    { auth: context.auth, memberOwnerId: context.operatorId },
    {
      memberId: String(action.args.memberId),
      fields: ["name", "age", "gender", "currentLocation", "occupation", "education"],
    },
  );
  return {
    rows: [
      {
        storeId: action.storeId,
        ownerId: context.operatorId,
        data: {
          memberId: profile.id,
          name: typeof profile.name === "string" ? profile.name : "",
          age: typeof profile.age === "number" ? profile.age : null,
          gender: typeof profile.gender === "string" ? profile.gender : "UNKNOWN",
          occupation: typeof profile.occupation === "string" ? profile.occupation : null,
          education: typeof profile.education === "string" ? profile.education : null,
          currentLocation:
            profile.currentLocation && typeof profile.currentLocation === "object"
              ? profile.currentLocation
              : { province: null, city: null, district: null },
        },
      },
    ],
    meta: { page: 1, pageSize: 1, total: 1, hasNext: false },
  };
};
