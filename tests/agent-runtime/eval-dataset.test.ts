import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Phase 1 offline eval dataset", () => {
  it("contains the minimum fixed coverage set without credentials", async () => {
    const raw = await readFile(resolve(process.cwd(), "evals/phase1-backoffice.json"), "utf8");
    const cases = JSON.parse(raw) as Array<{ id: string; input: string; expected: string }>;
    expect(cases).toHaveLength(60);
    expect(new Set(cases.map((item) => item.id)).size).toBe(cases.length);
    expect(cases.map((item) => item.expected)).toEqual(expect.arrayContaining(["clarification", "policy_rejected", "result_item_profile", "authorization_preserved"]));
  });
});
