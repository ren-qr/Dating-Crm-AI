import { z } from "zod";
import type { AtomicTool } from "../registry";
import { memberSummarySchema, rawMemberResultSchema } from "./search-members";

export const getMemberProfileInputSchema = z.object({ memberId: z.string().min(1).max(100) }).strict();

export const getMemberProfileCapability: AtomicTool = {
  name: "get_member_profile",
  type: "tool",
  enabled: true,
  allowedModes: ["new_query"],
  description: "查看一个已解析且当前有权限访问的会员摘要。会员定位由服务器引用解析，不能由模型提供内部 ID。",
  inputSchema: getMemberProfileInputSchema,
  outputSchema: rawMemberResultSchema,
  argumentHints: {
    memberRef: "结果 item-N、已选会员或服务器引用",
    memberName: "精确姓名，由服务器在授权范围内解析",
    memberNo: "精确会员编号，由服务器在授权范围内解析",
  },
  sideEffect: "none",
  requiredPermission: "member:read",
  confirmation: "never",
  trust: ["local", "cloud"],
  resultFields: {
    local: ["name", "age", "gender", "occupation", "education", "currentLocation"],
    cloud: ["age", "gender", "occupation", "education", "currentLocation"],
  },
};

export { memberSummarySchema };
