import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ areaFindMany: vi.fn(), memberFindMany: vi.fn() }));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    area: { findMany: mocks.areaFindMany },
    member: { findMany: mocks.memberFindMany },
  },
}));

import { executeMemberQuery } from "@/ai-query/execute-member-query";
import { memberFilterSchema, memberQuerySchema } from "@/ai-query/member-query-contract";
import { MEMBER_QUERY_FIELDS, isFindOnlyMemberQueryField } from "@/ai-query/member-query-fields";
import { MemberQueryParseError, parseMemberQuery } from "@/ai-query/parse-member-query";
import { applicationTrace, getApplicationTraceEvents } from "@/lib/server/query-trace";

const scope = { storeId: "store-a", ownerEmployeeId: "employee-a", traceId: "query-v2-trace" };
const areas = [
  { code: "33", name: "浙江省", parentCode: null, level: "PROVINCE" as const, isActive: true },
  { code: "3301", name: "杭州市", parentCode: "33", level: "CITY" as const, isActive: true },
  { code: "330102", name: "上城区", parentCode: "3301", level: "DISTRICT" as const, isActive: true },
];

function member(age: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `member-${age}`,
    storeId: "store-a",
    ownerEmployeeId: "employee-a",
    memberNo: `M${age}`,
    name: `会员${age}`,
    gender: "FEMALE",
    birthDate: `${new Date().getUTCFullYear() - age}-01-01`,
    status: "ACTIVE",
    heightCm: 175,
    weightKg: 55,
    education: "本科",
    occupation: "教师",
    incomeRange: "20-30万",
    maritalStatus: "未婚",
    housingStatus: "有房",
    vehicleStatus: "有车",
    hometownProvince: "33",
    hometownCity: "3301",
    hometownDistrict: "330102",
    currentProvince: "33",
    currentCity: "3301",
    currentDistrict: "330102",
    profileCompletenessPercent: 80,
    extraProfile: { storeId: "store-a", hobbies: "阅读,旅行", selfDescription: "喜欢城市漫步" },
    ...overrides,
  };
}

beforeEach(() => {
  applicationTrace.events.length = 0;
  mocks.areaFindMany.mockClear();
  mocks.memberFindMany.mockClear();
  mocks.areaFindMany.mockImplementation(({ where }: { where: { code?: string; name?: { in?: string[] } } }) => {
    if (where.code) return Promise.resolve(areas.filter((area) => area.code === where.code));
    return Promise.resolve(areas.filter((area) => where.name?.in?.includes(area.name)));
  });
  mocks.memberFindMany.mockResolvedValue([member(27), member(28), member(30), member(32), member(33)]);
});

describe("Member Query V2 contract", () => {
  it("keeps every Registry field covered by the contract", () => {
    for (const [field, definition] of Object.entries(MEMBER_QUERY_FIELDS)) {
      const value = definition.type === "number" ? 30
        : definition.type === "area" ? "杭州"
          : definition.type === "date" ? "1996-01-01"
            : field === "gender" ? "FEMALE"
              : field === "status" ? "ACTIVE"
                : field === "phone" ? "13800138000"
                  : field === "idCard" ? "110101199001011234"
                    : "测试值";
      expect(memberFilterSchema.safeParse({ field, op: definition.operators[0], value }).success).toBe(true);
      expect(memberQuerySchema.safeParse({
        task: isFindOnlyMemberQueryField(field as keyof typeof MEMBER_QUERY_FIELDS) ? "find_member" : "search_members",
        filters: [{ field, op: definition.operators[0], value }],
        unresolved: [],
      }).success).toBe(true);
    }
  });

  it("calls the V2 parser once and preserves all explicit natural-language conditions", async () => {
    const complete = vi.fn<(system: string, content: string) => Promise<string>>(async () => JSON.stringify({
      task: "search_members",
      filters: [
        { field: "currentLocation", op: "eq", value: "杭州" },
        { field: "age", op: "around", value: 30 },
        { field: "heightCm", op: "gte", value: 175 },
        { field: "education", op: "eq", value: "本科" },
        { field: "maritalStatus", op: "eq", value: "未婚" },
        { field: "gender", op: "eq", value: "FEMALE" },
      ],
      unresolved: [],
    }));
    const query = await parseMemberQuery("杭州30岁左右175以上本科未婚女生", complete);

    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0]?.[0]).toContain("profileCompletenessPercent");
    expect(query.filters).toHaveLength(6);
    expect(query.filters.map((filter) => filter.field)).toEqual([
      "currentLocation", "age", "heightCm", "education", "maritalStatus", "gender",
    ]);
  });

  it("normalizes numeric strings returned by the configured model without relaxing other fields", async () => {
    const query = await parseMemberQuery("30岁女生", async () => JSON.stringify({
      task: "search_members",
      filters: [
        { field: "age", op: "eq", value: "30" },
        { field: "gender", op: "eq", value: "FEMALE" },
      ],
      unresolved: [],
    }));
    expect(query.filters).toEqual([
      { field: "age", op: "eq", value: 30 },
      { field: "gender", op: "eq", value: "FEMALE" },
    ]);

    await expect(parseMemberQuery("查询", async () => JSON.stringify({
      task: "search_members",
      filters: [{ field: "age", op: "eq", value: "三十" }],
      unresolved: [],
    }))).rejects.toBeInstanceOf(MemberQueryParseError);
  });

  it("does not send sensitive identifiers to the parser and builds a local exact find query", async () => {
    const complete = vi.fn();
    await expect(parseMemberQuery("查手机号 138 0013 8000 的会员", complete)).resolves.toEqual({
      task: "find_member",
      filters: [{ field: "phone", op: "eq", value: "13800138000" }],
      unresolved: [],
    });
    expect(complete).not.toHaveBeenCalled();
  });

  it("rejects unapproved fields, Area codes, and invalid model output", async () => {
    await expect(parseMemberQuery("查询", async () => "not-json")).rejects.toBeInstanceOf(MemberQueryParseError);
    await expect(parseMemberQuery("查询", async () => JSON.stringify({
      task: "search_members", filters: [{ field: "storeId", op: "eq", value: "other-store" }], unresolved: [],
    }))).rejects.toBeInstanceOf(MemberQueryParseError);
    await expect(parseMemberQuery("查询", async () => JSON.stringify({
      task: "search_members", filters: [{ field: "currentLocation", op: "eq", value: "3301" }], unresolved: [],
    }))).rejects.toBeInstanceOf(MemberQueryParseError);
  });

  it("expands age around deterministically and returns every member from 28 through 32", async () => {
    const result = await executeMemberQuery({
      task: "search_members",
      filters: [
        { field: "currentLocation", op: "eq", value: "杭州" },
        { field: "age", op: "around", value: 30 },
      ],
      unresolved: [],
    }, scope);

    expect(result).toMatchObject({ total: 3 });
    if ("items" in result) expect(result.items.map((item) => item.age)).toEqual([28, 30, 32]);
    expect(mocks.memberFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AND: expect.arrayContaining([
        { storeId: "store-a" },
        { ownerEmployeeId: "employee-a" },
        { currentCity: "3301" },
      ]) }),
    }));
  });

  it.each([
    ["currentProvince", "浙江省", "currentProvince", "33"],
    ["currentCity", "杭州", "currentCity", "3301"],
    ["currentDistrict", "上城区", "currentDistrict", "330102"],
  ])("resolves %s through the real 2/4/6 Area dictionary contract", async (field, value, expectedField, code) => {
    await executeMemberQuery({
      task: "search_members",
      filters: [{ field: field as keyof typeof MEMBER_QUERY_FIELDS, op: "eq", value }],
      unresolved: [],
    }, scope);
    expect(mocks.memberFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AND: expect.arrayContaining([{ [expectedField]: code }]) }),
    }));
  });

  it("keeps unresolved business language visible and blocks execution", async () => {
    const result = await executeMemberQuery({
      task: "search_members",
      filters: [{ field: "currentLocation", op: "eq", value: "杭州" }],
      unresolved: [{ text: "条件不错", reason: "暂无明确业务标准" }],
    }, scope);
    expect(result).toMatchObject({ status: "ValidationError", details: { unresolved: [{ text: "条件不错" }] } });
    expect(mocks.memberFindMany).not.toHaveBeenCalled();
  });

  it("enforces the same store and owner scope even when the repository returns foreign rows", async () => {
    mocks.memberFindMany.mockResolvedValue([
      member(30),
      member(29, { id: "other-store", storeId: "store-b" }),
      member(28, { id: "other-owner", ownerEmployeeId: "employee-b" }),
    ]);
    const result = await executeMemberQuery({
      task: "search_members",
      filters: [{ field: "gender", op: "eq", value: "FEMALE" }],
      unresolved: [],
    }, scope);
    if ("items" in result) expect(result.items.map((item) => item.id)).toEqual(["member-30"]);
    expect(JSON.stringify(result)).not.toContain("phoneHash");
    expect(getApplicationTraceEvents(scope.traceId).map((event) => event.stage)).toEqual(expect.arrayContaining([
      "member_query_validation",
      "member_query_execution_started",
      "member_query_result_policy",
      "member_query_execution_completed",
    ]));
  });
});
