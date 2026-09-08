import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ areaFindMany: vi.fn() }));

vi.mock("@/lib/server/prisma", () => ({
  prisma: { area: { findMany: mocks.areaFindMany } },
}));

import { CapabilityRegistry } from "@/agent-system/capabilities/registry";
import { searchCapability, searchInputSchema } from "@/agent-system/capabilities/tools/search-members";
import { CapabilityGateway } from "@/agent-system/gateway/capability-gateway";
import type { RuntimeContext } from "@/agent-system/runtime/runtime-context";
import { emptyWorkingState } from "@/agent-system/state/working-state";
import { MemoryTrace } from "@/agent-system/tracing/trace";

const areas = [
  { code: "31", name: "上海市", parentCode: null, level: "PROVINCE" as const, isActive: true },
  { code: "3101", name: "上海市", parentCode: "31", level: "CITY" as const, isActive: true },
  { code: "310101", name: "黄浦区", parentCode: "3101", level: "DISTRICT" as const, isActive: true },
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
  sessionId: "area-session",
  traceId: "area-trace",
  trustZone: "cloud",
};

function resolveAction(input: unknown) {
  return new CapabilityGateway(
    new CapabilityRegistry([searchCapability]),
    new MemoryTrace(),
  ).resolve(input, context, emptyWorkingState());
}

beforeEach(() => {
  mocks.areaFindMany.mockImplementation(({ where }: { where: { code?: string; level?: string; name?: { in?: string[] } } }) => {
    if (where.code) {
      return Promise.resolve(
        areas.filter((area) => area.code === where.code && area.level === where.level && area.isActive),
      );
    }
    return Promise.resolve(areas.filter((area) => where.name?.in?.includes(area.name) && area.isActive));
  });
});

describe("search_members area code contract", () => {
  it("resolves real dictionary text locations through Gateway", async () => {
    const current = await resolveAction({
      capability: "search_members",
      args: { currentLocation: { kind: "exact", value: "上海" } },
    });
    const hometown = await resolveAction({
      capability: "search_members",
      args: { hometownLocation: { kind: "exact", value: "杭州" } },
    });

    expect(current).toMatchObject({ status: "ResolvedAction", action: { args: { currentCityCode: "3101" } } });
    expect(hometown).toMatchObject({ status: "ResolvedAction", action: { args: { hometownCityCode: "3301" } } });
  });

  it.each([
    ["31", "PROVINCE", "currentProvinceCode"],
    ["3101", "CITY", "currentCityCode"],
    ["310101", "DISTRICT", "currentDistrictCode"],
  ])("accepts direct %s %s codes and writes %s", async (code, level, field) => {
    const result = await resolveAction({
      capability: "search_members",
      args: { currentLocation: { kind: "exact", value: code } },
    });

    expect(result).toMatchObject({ status: "ResolvedAction", action: { args: { [field]: code } } });
    expect(mocks.areaFindMany).toHaveBeenLastCalledWith({
      where: { code, level, isActive: true },
      take: 3,
    });
  });

  it("enforces the 2/4/6 contract for each resolved Member location field", () => {
    expect(searchInputSchema.safeParse({
      currentProvinceCode: "31",
      currentCityCode: "3101",
      currentDistrictCode: "310101",
      hometownProvinceCode: "33",
      hometownCityCode: "3301",
      hometownDistrictCode: "330102",
    }).success).toBe(true);

    for (const input of [
      { currentProvinceCode: "3101" },
      { currentCityCode: "31" },
      { currentDistrictCode: "3101" },
      { hometownProvinceCode: "330102" },
      { hometownCityCode: "330102" },
      { hometownDistrictCode: "33" },
    ]) {
      expect(searchInputSchema.safeParse(input).success).toBe(false);
    }
  });
});
