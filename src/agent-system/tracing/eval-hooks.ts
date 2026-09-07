export type EvalEvent = { traceId: string; status: string; durationMs: number };
export interface EvalHooks {
  onTurn(event: EvalEvent): void;
}
export class MemoryEval implements EvalHooks {
  readonly events: EvalEvent[] = [];
  onTurn(event: EvalEvent) {
    this.events.push(event);
    if (this.events.length > 10000) this.events.shift();
  }
}
