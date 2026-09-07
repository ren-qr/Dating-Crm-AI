import { afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { memberProfileView } from "@/lib/server/member-profile-view";

const schemaText = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
const seedText = readFileSync(resolve(process.cwd(), "prisma/seed.mjs"), "utf8");
const databaseUrl = process.env.DATABASE_URL;
const prisma = databaseUrl ? new PrismaClient() : null;

const migratedFields = [
  "heightCm",
  "weightKg",
  "education",
  "occupation",
  "incomeRange",
  "maritalStatus",
  "housingStatus",
  "vehicleStatus",
  "hometown",
  "currentCity",
  "familyBackground",
  "selfDescription",
  "matePreference",
  "profileCompletenessPercent",
] as const;

afterAll(async () => {
  await prisma?.$disconnect();
});

describe("MemberProfile consolidation regression contract", () => {
  it("keeps all legacy profile fields represented on Member during the compatibility window", () => {
    for (const field of migratedFields) {
      expect(schemaText).toMatch(new RegExp(`\\b${field}\\b`));
    }

    if (schemaText.includes("model MemberProfile")) {
      expect(schemaText).toContain("profile            MemberProfile?");
    }
  });

  it("returns the flattened Member fields", () => {
    const flattened = memberProfileView({
      education: "硕士",
      heightCm: 175,
      currentCity: "上海",
      profileCompletenessPercent: 90,
    });
    expect(flattened).toMatchObject({
      education: "硕士",
      heightCm: 175,
      currentCity: "上海",
      profileCompletenessPercent: 90,
    });
  });

  it("keeps seed initialization compatible with the consolidation plan", () => {
    expect(seedText).toContain("profileCompletenessPercent");
    expect(seedText).toContain('"profile:read"');
    expect(seedText).toContain('"profile:write"');

    expect(seedText).not.toContain("prisma.memberProfile");
  });

  it.runIf(Boolean(databaseUrl))("smokes existing database data consistency when DATABASE_URL is configured", async () => {
    const members = await prisma!.member.findMany({
      select: {
        id: true,
        heightCm: true,
        weightKg: true,
        education: true,
        occupation: true,
        incomeRange: true,
        maritalStatus: true,
        housingStatus: true,
        vehicleStatus: true,
        hometown: true,
        currentCity: true,
        familyBackground: true,
        selfDescription: true,
        matePreference: true,
        profileCompletenessPercent: true,
      },
    });

    expect(members.every((member) => member.profileCompletenessPercent >= 0)).toBe(true);
  });
});
