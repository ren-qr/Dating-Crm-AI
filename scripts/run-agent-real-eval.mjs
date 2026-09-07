import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const dataset = JSON.parse(await readFile(new URL("../evals/phase1-backoffice.json", import.meta.url), "utf8"));
if (!Array.isArray(dataset.scenarios) || dataset.scenarios.length < 60) {
  throw new Error("Phase 1 eval dataset must contain at least 60 structured scenarios.");
}

if (process.env.AGENT_REAL_EVAL_ENABLED !== "1") {
  console.log(`Real-model eval: NOT RUN (credentials unavailable). Structured scenarios loaded: ${dataset.scenarios.length}.`);
  process.exit(0);
}

const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(command, ["vitest", "run", "tests/agent-runtime/real-provider-eval.test.ts"], {
  stdio: "inherit",
  env: { ...process.env, AGENT_REAL_EVAL_ENABLED: "1", AGENT_EVAL_OUTPUT_DIR: "evals/results" },
});
process.exit(result.status ?? 1);
