export const MEMBER_QUERY_OPERATORS = [
  "eq",
  "neq",
  "contains",
  "in",
  "gte",
  "lte",
  "between",
  "around",
] as const;

export type MemberQueryOperator = (typeof MEMBER_QUERY_OPERATORS)[number];
export type MemberQueryFieldType = "text" | "number" | "date" | "enum" | "area" | "sensitive";

type MemberQueryFieldDefinition = {
  type: MemberQueryFieldType;
  operators: readonly MemberQueryOperator[];
  aroundTolerance?: number;
  findOnly?: boolean;
  description: string;
};

/**
 * The one allowlist for natural-language member queries. Values describe user
 * intent only; store, owner, permissions, Area codes, and Prisma fields remain
 * server-owned concerns.
 */
export const MEMBER_QUERY_FIELDS = {
  memberNo: { type: "text", operators: ["eq", "contains"], description: "会员编号" },
  name: { type: "text", operators: ["eq", "contains"], description: "姓名" },
  gender: { type: "enum", operators: ["eq", "in"], description: "性别（MALE/FEMALE/OTHER/UNKNOWN）" },
  birthDate: { type: "date", operators: ["eq", "gte", "lte", "between"], description: "出生日期（YYYY-MM-DD）" },
  age: { type: "number", operators: ["eq", "gte", "lte", "between", "around"], aroundTolerance: 2, description: "年龄" },
  status: { type: "enum", operators: ["eq", "in"], description: "会员状态" },
  heightCm: { type: "number", operators: ["eq", "gte", "lte", "between"], description: "身高厘米" },
  weightKg: { type: "number", operators: ["eq", "gte", "lte", "between"], description: "体重公斤" },
  education: { type: "text", operators: ["eq", "contains", "in"], description: "学历原始文本" },
  occupation: { type: "text", operators: ["eq", "contains", "in"], description: "职业原始文本" },
  incomeRange: { type: "text", operators: ["eq", "contains", "in"], description: "收入范围原始文本" },
  maritalStatus: { type: "text", operators: ["eq", "contains", "in"], description: "婚姻状况" },
  housingStatus: { type: "text", operators: ["eq", "contains", "in"], description: "住房情况" },
  vehicleStatus: { type: "text", operators: ["eq", "contains", "in"], description: "车辆情况" },
  hometownProvince: { type: "area", operators: ["eq"], description: "籍贯省级地区名称" },
  hometownCity: { type: "area", operators: ["eq"], description: "籍贯市级地区名称" },
  hometownDistrict: { type: "area", operators: ["eq"], description: "籍贯区县地区名称" },
  currentProvince: { type: "area", operators: ["eq"], description: "现居省级地区名称" },
  currentCity: { type: "area", operators: ["eq"], description: "现居市级地区名称" },
  currentDistrict: { type: "area", operators: ["eq"], description: "现居区县地区名称" },
  hometownLocation: { type: "area", operators: ["eq"], description: "籍贯地区名称" },
  currentLocation: { type: "area", operators: ["eq"], description: "现居地区名称" },
  profileCompletenessPercent: { type: "number", operators: ["eq", "gte", "lte", "between"], description: "资料完整度百分比" },
  hobbies: { type: "text", operators: ["contains", "eq"], description: "兴趣爱好原始文本" },
  selfDescription: { type: "text", operators: ["contains", "eq"], description: "自我描述原始文本" },
  phone: { type: "sensitive", operators: ["eq"], findOnly: true, description: "手机号，仅精确查找" },
  idCard: { type: "sensitive", operators: ["eq"], findOnly: true, description: "身份证号，仅精确查找" },
} as const satisfies Record<string, MemberQueryFieldDefinition>;

export type MemberQueryableField = keyof typeof MEMBER_QUERY_FIELDS;

export function getMemberQueryFieldDefinition(field: MemberQueryableField): MemberQueryFieldDefinition {
  return MEMBER_QUERY_FIELDS[field];
}

export function isFindOnlyMemberQueryField(field: MemberQueryableField) {
  return getMemberQueryFieldDefinition(field).findOnly === true;
}

export function isMemberQueryableField(value: string): value is MemberQueryableField {
  return Object.hasOwn(MEMBER_QUERY_FIELDS, value);
}

export function memberQueryPromptFieldList() {
  return Object.entries(MEMBER_QUERY_FIELDS)
    .map(([field, definition]) => `${field}（${definition.description}；操作符：${definition.operators.join("/")}）`)
    .join("\n");
}
