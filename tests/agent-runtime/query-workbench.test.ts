import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ areaFindMany: vi.fn(), memberFindMany: vi.fn() }));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    area: { findMany: mocks.areaFindMany },
    member: { findMany: mocks.memberFindMany },
  },
}));

import { executeMemberSearchDraft } from "@/agent-system/query-workbench/member-search-execution";
import { MemberSearchDraftParseError, parseMemberSearchDraft } from "@/agent-system/query-workbench/member-search-parser";
import { resolveMemberSearchDraft } from "@/agent-system/query-workbench/member-search-draft";
import type { RuntimeContext } from "@/agent-system/runtime/runtime-context";

const areas = [
  { code: "33", name: "浙江省", parentCode: null, level: "PROVINCE" as const, isActive: true },
  { code: "3301", name: "杭州市", parentCode: "33", level: "CITY" as const, isActive: true },
  { code: "330102", name: "上城区", parentCode: "3301", level: "DISTRICT" as const, isActive: true },
];

const context: RuntimeContext = {
  auth: {
    employee: {
      employeeId: "employee-a",
      storeId: "store-a",
      email: "fixture@example.test",
      name: "fixture",
      roleCodes: ["consultant"],
      roleLevel: "staff",
      roleName: "员工",
      permissions: ["member:read"],
    },
    employeeStoreId: "store-a",
    isBootstrapAdmin: false,
  },
  operatorId: "employee-a",
  storeId: "store-a",
  sessionId: "workbench-session",
  traceId: "workbench-trace",
  trustZone: "local",
};

beforeEach(() => {
  mocks.areaFindMany.mockImplementation(({ where }: { where: { code?: string; name?: { in?: string[] } } }) => {
    if (where.code) return Promise.resolve(areas.filter((area) => area.code === where.code));
    return Promise.resolve(areas.filter((area) => where.name?.in?.includes(area.name)));
  });
  mocks.memberFindMany.mockResolvedValue([{
    id: "member-1",
    name: "林晓雨",
    birthDate: "1998-06-01",
    gender: "FEMALE",
    occupation: "教师",
    education: "本科",
    currentProvince: "33",
    currentCity: "3301",
    currentDistrict: "330102",
  }]);
});

afterEach(() => vi.clearAllMocks());

describe("Query Workbench draft and execution", () => {
  it("resolves 杭州 + 女 + ageMax deterministically before execution", async () => {
    await expect(resolveMemberSearchDraft({
      age: { mode: "bounds", max: 30 },
      gender: "FEMALE",
      currentLocation: "杭州",
      unresolved: [],
    })).resolves.toMatchObject({
      filters: { ageMax: 30, gender: "FEMALE", currentCityCode: "3301" },
    });
  });

  it.each([
    [{ mode: "exact", value: 30 }, { ageMin: 30, ageMax: 30 }],
    [{ mode: "bounds", min: 30 }, { ageMin: 30 }],
    [{ mode: "bounds", min: 26, max: 30 }, { ageMin: 26, ageMax: 30 }],
    [{ mode: "around", value: 28 }, { ageMin: 26, ageMax: 30 }],
  ])("resolves age draft %# deterministically", async (age, filters) => {
    await expect(resolveMemberSearchDraft({ age, unresolved: [] })).resolves.toMatchObject({ filters });
  });

  it("rejects invalid structured age bounds", async () => {
    await expect(resolveMemberSearchDraft({
      age: { mode: "bounds", min: 31, max: 30 },
      unresolved: [],
    })).resolves.toMatchObject({ status: "ValidationError" });
  });

  it("executes the edited structured draft through Gateway, Executor, scope, and Result Policy", async () => {
    const result = await executeMemberSearchDraft({
      age: { mode: "bounds", max: 29 },
      gender: "FEMALE",
      currentLocation: "杭州",
      unresolved: [],
    }, 1, context);

    expect(result).toMatchObject({ items: [{ id: "member-1", name: "林晓雨", gender: "FEMALE" }] });
    expect(mocks.memberFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        storeId: "store-a",
        ownerEmployeeId: "employee-a",
        gender: "FEMALE",
        currentCity: "3301",
      }),
    }));
    expect(JSON.stringify(result)).not.toContain("phone");
    expect(JSON.stringify(result)).not.toContain("store-a");
  });

  it.each([
    ["杭州30岁以下女生", { age: { mode: "bounds", max: 30 }, gender: "FEMALE", currentLocation: "杭州", unresolved: [] }],
    ["30岁以上女生", { age: { mode: "bounds", min: 30 }, gender: "FEMALE", unresolved: [] }],
    ["26到30岁杭州女生", { age: { mode: "bounds", min: 26, max: 30 }, gender: "FEMALE", currentLocation: "杭州", unresolved: [] }],
  ])("accepts a narrow JSON draft contract for %s", async (_text, expected) => {
    await expect(parseMemberSearchDraft(_text, async () => JSON.stringify(expected))).resolves.toEqual(expected);
  });

  it("rejects invalid model output before it can enter deterministic execution", async () => {
    await expect(parseMemberSearchDraft("查询", async () => "not-json")).rejects.toBeInstanceOf(MemberSearchDraftParseError);
    await expect(parseMemberSearchDraft("查询", async () => JSON.stringify({
      gender: "FEMALE",
      storeId: "other-store",
      unresolved: [],
    }))).rejects.toBeInstanceOf(MemberSearchDraftParseError);
    await expect(parseMemberSearchDraft("查询", async () => JSON.stringify({
      currentLocation: "3301",
      unresolved: [],
    }))).rejects.toBeInstanceOf(MemberSearchDraftParseError);
  });
});
