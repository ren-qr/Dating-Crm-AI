import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const routes = [
  "src/app/api/v1/members/[id]/route.ts",
  "src/app/api/v1/members/owners/route.ts",
  "src/app/api/v1/followups/route.ts",
  "src/app/api/v1/blacklists/route.ts",
  "src/app/api/v1/audits/route.ts",
  "src/app/api/v1/staff/route.ts",
  "src/app/api/v1/staff/[id]/route.ts",
];

describe("phase two API route files", () => {
  it.each(routes)("%s exists for route-level acceptance tests", (routePath) => {
    expect(
      existsSync(path.join(process.cwd(), routePath)),
      `${routePath} is required for first/second phase acceptance`,
    ).toBe(true);
  });
});
