import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Phase 1 executable eval dataset", () => {
  it("contains 60 structured scenarios including multi-turn working-state coverage", async () => {
    const raw = await readFile(resolve(process.cwd(), "evals/phase1-backoffice.json"), "utf8");
    const dataset = JSON.parse(raw) as {
      schemaVersion: string;
      scenarios: Array<{ id: string; turns: Array<{ input: string; expect: { status: string } }> }>;
    };
    expect(dataset.schemaVersion).toBe("phase1-agent-eval-v0.1");
    expect(dataset.scenarios).toHaveLength(60);
    expect(new Set(dataset.scenarios.map((item) => item.id)).size).toBe(dataset.scenarios.length);
    expect(dataset.scenarios.filter((item) => item.turns.length > 1).length).toBeGreaterThan(0);
    expect(dataset.scenarios.flatMap((item) => item.turns.map((turn) => turn.expect.status))).toEqual(
      expect.arrayContaining(["ClarificationRequired", "PolicyRejected", "Failed"]),
    );
  });
});
