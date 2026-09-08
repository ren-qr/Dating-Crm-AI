import { z } from "zod";
import type { AtomicTool } from "../registry";

const provinceCode = z.string().regex(/^\d{2}$/);
const cityCode = z.string().regex(/^\d{4}$/);
const districtCode = z.string().regex(/^\d{6}$/);
export const searchInputSchema = z
  .object({
    ageMin: z.number().int().min(18).max(100).optional(),
    ageMax: z.number().int().min(18).max(100).optional(),
    gender: z.enum(["MALE", "FEMALE", "OTHER", "UNKNOWN"]).optional(),
    currentProvinceCode: provinceCode.optional(),
    currentCityCode: cityCode.optional(),
    currentDistrictCode: districtCode.optional(),
    hometownProvinceCode: provinceCode.optional(),
    hometownCityCode: cityCode.optional(),
    hometownDistrictCode: districtCode.optional(),
    occupation: z.string().trim().min(1).max(100).optional(),
    education: z.string().trim().min(1).max(100).optional(),
    incomeRange: z.string().trim().min(1).max(100).optional(),
    page: z.number().int().min(1).max(10000).default(1),
    pageSize: z.number().int().min(1).max(50).default(10),
  })
  .strict()
  .refine(
    (value) =>
      value.ageMin === undefined || value.ageMax === undefined || value.ageMin <= value.ageMax,
  );

export const memberSummarySchema = z
  .object({
    memberId: z.string(),
    name: z.string(),
    age: z.number().nullable(),
    gender: z.string(),
    occupation: z.string().nullable(),
    education: z.string().nullable(),
    currentLocation: z
      .object({ province: z.string().nullable(), city: z.string().nullable(), district: z.string().nullable() })
      .strict(),
  })
  .strict();

export const rawMemberResultSchema = z
  .object({
    rows: z
      .array(z.object({ storeId: z.string(), ownerId: z.string(), data: memberSummarySchema }).strict())
      .max(50),
    meta: z
      .object({ page: z.number(), pageSize: z.number(), total: z.number(), hasNext: z.boolean() })
      .strict(),
  })
  .strict();

export const searchCapability: AtomicTool = {
  name: "search_members",
  type: "tool",
  enabled: true,
  allowedModes: ["new_query", "refine_query", "paginate_query"],
  description: "按明确的会员条件搜索，不进行匹配评分或排序。地区必须由服务器解析成 Area.code。",
  inputSchema: searchInputSchema,
  outputSchema: rawMemberResultSchema,
  argumentHints: {
    gender: "性别的精确值",
    age: "年龄精确值、范围或 around/younger 语义",
    ageMin: "最小年龄的精确整数",
    ageMax: "最大年龄的精确整数",
    currentLocation: "现居地区文本或地区语义；服务器解析为 Area.code",
    hometownLocation: "籍贯地区文本或地区语义；服务器解析为 Area.code",
    occupation: "职业精确文本",
    education: "学历精确文本；不支持学历等级排序",
    incomeRange: "现有收入范围精确文本；不支持数值比较",
    pageSize: "结果数量，1至50",
    page: "页码",
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
