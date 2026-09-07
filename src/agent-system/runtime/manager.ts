import { z } from "zod";
import { capabilityRequestSchema } from "../contracts/capability-request";
import type { ModelContextView } from "./context-builder";
import { managerPrompt, responsePrompt } from "../prompts/manager";

export const managerDecisionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("capability"), request: capabilityRequestSchema }).strict(),
  z.object({ kind: z.literal("answer"), text: z.string().min(1).max(4000) }).strict(),
]);
export type ManagerDecision = z.infer<typeof managerDecisionSchema>;
export interface Manager {
  decide(view: ModelContextView): Promise<unknown>;
  respond(view: ModelContextView): Promise<string>;
}
export type ModelCompletion = (system: string, content: string) => Promise<string>;
export class ModelManager implements Manager {
  constructor(private complete: ModelCompletion) {}
  async decide(view: ModelContextView) {
    return JSON.parse(await this.complete(managerPrompt, JSON.stringify(view)));
  }
  respond(view: ModelContextView) {
    return this.complete(responsePrompt, JSON.stringify(view));
  }
}
