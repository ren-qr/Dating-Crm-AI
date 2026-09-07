import { afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const schemaText = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
const databaseUrl = process.env.DATABASE_URL;
const prisma = databaseUrl ? new PrismaClient() : null;

afterAll(async () => { await prisma?.$disconnect(); });

describe("Member V3.1 storage regression contract", () => {
  it("keeps basic fields on Member and extensions in their dedicated models", () => {
    expect(schemaText).toContain("model MemberSensitiveInfo");
    expect(schemaText).toContain("model MemberMatePreference");
    expect(schemaText).toContain("model MemberExtraProfile");
    expect(schemaText).not.toContain("model MemberProfile");
    expect(schemaText).toMatch(/model Member \{[\s\S]*hometownProvince/);
    expect(schemaText).toMatch(/model MemberExtraProfile \{[\s\S]*selfDescription/);
  });

  it.runIf(Boolean(databaseUrl))("loads V3.1 member relations from the configured database", async () => {
    const members = await prisma!.member.findMany({
      take: 5,
      include: { sensitiveInfo: true, matePreference: true, extraProfile: true },
    });
    expect(members.every((member) => member.sensitiveInfo?.storeId === undefined || member.sensitiveInfo.storeId === member.storeId)).toBe(true);
    expect(members.every((member) => member.matePreference?.storeId === undefined || member.matePreference.storeId === member.storeId)).toBe(true);
    expect(members.every((member) => member.extraProfile?.storeId === undefined || member.extraProfile.storeId === member.storeId)).toBe(true);
  });
});
