import { z } from "zod";
import { MEMBER_QUERY_FIELDS, MEMBER_QUERY_OPERATORS, isFindOnlyMemberQueryField, type MemberQueryableField } from "./member-query-fields";

const filterValueSchema = z.union([
  z.string().trim().min(1).max(500),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().trim().min(1).max(500)).min(1).max(20),
  z.array(z.number().finite()).length(2),
]);

const unresolvedConditionSchema = z.object({
  text: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(1).max(120),
}).strict();

export const memberFilterSchema = z.object({
  field: z.enum(Object.keys(MEMBER_QUERY_FIELDS) as [MemberQueryableField, ...MemberQueryableField[]]),
  op: z.enum(MEMBER_QUERY_OPERATORS),
  value: filterValueSchema,
}).strict().superRefine((filter, context) => {
  const definition = MEMBER_QUERY_FIELDS[filter.field];
  if (!(definition.operators as readonly string[]).includes(filter.op)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "该字段不支持此操作符" });
    return;
  }
  if (filter.op === "between" && (!Array.isArray(filter.value) || filter.value.length !== 2)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "between 必须提供两个边界值" });
  }
  if (filter.op === "in" && !Array.isArray(filter.value)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "in 必须提供数组值" });
  }
  if (["number", "enum"].includes(definition.type) && filter.field !== "gender" && filter.field !== "status") {
    const values = Array.isArray(filter.value) ? filter.value : [filter.value];
    if (definition.type === "number" && values.some((value) => typeof value !== "number")) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "数值字段必须使用数值" });
    }
  }
  if (definition.type === "area" && typeof filter.value === "string" && /^\d{2}(?:\d{2}(?:\d{2})?)?$/u.test(filter.value)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "地区必须使用名称，不能使用地区编码" });
  }
});

export const memberQuerySchema = z.object({
  task: z.enum(["find_member", "search_members"]),
  filters: z.array(memberFilterSchema).min(1).max(20),
  unresolved: z.array(unresolvedConditionSchema).max(10).default([]),
}).strict().superRefine((query, context) => {
  const sensitive = query.filters.filter((filter) => isFindOnlyMemberQueryField(filter.field));
  if (query.task === "search_members" && sensitive.length > 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "敏感标识只能用于精确查找" });
  }
  if (query.task === "find_member") {
    const identifiers = query.filters.filter((filter) => ["name", "memberNo", "phone", "idCard"].includes(filter.field));
    if (identifiers.length === 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "精确查找需要姓名、会员编号、手机号或身份证号" });
    }
  }
});

export type MemberFilter = z.infer<typeof memberFilterSchema>;
export type MemberQuery = z.infer<typeof memberQuerySchema>;
export type UnresolvedCondition = z.infer<typeof unresolvedConditionSchema>;
