import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  memberFindFirst: vi.fn(),
  preferenceFindFirst: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    member: { findFirst: mocks.memberFindFirst },
    memberMatePreference: { findFirst: mocks.preferenceFindFirst },
  },
}));

const { getMemberMatePreference } = await import("@/business-support/tools/member");

const context = {
  auth: {
    isBootstrapAdmin: true,
    employeeStoreId: "store_1",
    employee: { permissions: [] },
  },
} as never;

afterEach(() => {
  vi.clearAllMocks();
});

describe("get_member_mate_preference", () => {
  it("returns only requested preference fields", async () => {
    mocks.memberFindFirst.mockResolvedValue({ id: "member_1" });
    mocks.preferenceFindFirst.mockResolvedValue({
      ageMin: 26,
      ageMax: 32,
      genderPreference: "OPPOSITE",
      educationRequirement: "本科",
      incomeMinAnnual: 200000,
      heightMinCm: 165,
      heightMaxCm: 180,
      maritalStatusRequirements: ["未婚"],
      hasHousing: null,
      hasVehicle: true,
      smokingPreference: "不限",
      drinkingPreference: "不限",
    });

    await expect(getMemberMatePreference(context, {
      memberId: "member_1",
      fields: ["ageMin", "genderPreference", "hasVehicle"],
    })).resolves.toEqual({
      memberId: "member_1",
      ageMin: 26,
      genderPreference: "OPPOSITE",
      hasVehicle: true,
    });
  });

  it("returns null when the member has no preference record", async () => {
    mocks.memberFindFirst.mockResolvedValue({ id: "member_1" });
    mocks.preferenceFindFirst.mockResolvedValue(null);

    await expect(getMemberMatePreference(context, { memberId: "member_1" })).resolves.toBeNull();
  });
});
