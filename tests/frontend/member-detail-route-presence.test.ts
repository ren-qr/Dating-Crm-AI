import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("member detail frontend acceptance surface", () => {
  it("has a member detail screen that can be tested against GET/PATCH /api/v1/members/[id]", () => {
    const candidates = [
      "src/app/(admin)/members/[id]/page.tsx",
      "src/app/members/[id]/page.tsx",
      "src/components/member-detail.tsx",
      "src/interface/web/components/member-workbench.tsx",
    ];

    expect(
      candidates.some((candidate) => existsSync(path.join(process.cwd(), candidate))),
      `expected one of: ${candidates.join(", ")}`,
    ).toBe(true);
  });
});
