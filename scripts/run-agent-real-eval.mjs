import { readFile } from "node:fs/promises";

const dataset = JSON.parse(await readFile(new URL("../evals/phase1-backoffice.json", import.meta.url), "utf8"));
if (dataset.length < 60) throw new Error("Phase 1 eval dataset must contain at least 60 cases.");

// This command intentionally never reads or prints configured secrets. A real-provider
// harness belongs in the deployment environment where AiSetting can be resolved safely.
if (!process.env.AGENT_REAL_EVAL_ENABLED) {
  console.log(`Real-model eval: NOT RUN (credentials unavailable). Dataset loaded: ${dataset.length} cases.`);
  process.exit(0);
}

throw new Error("Real-provider eval is enabled but no approved server-side harness is configured.");
