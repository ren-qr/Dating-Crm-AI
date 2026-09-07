import { createHash } from "node:crypto";

export type TraceEvent = { traceId: string; stage: string; at: string; digest: string };
export interface TraceSink {
  record(traceId: string, stage: string, value: unknown): void;
}
export class MemoryTrace implements TraceSink {
  readonly events: TraceEvent[] = [];
  record(traceId: string, stage: string, value: unknown) {
    this.events.push({
      traceId,
      stage,
      at: new Date().toISOString(),
      digest: createHash("sha256")
        .update(JSON.stringify(value) ?? "null")
        .digest("hex"),
    });
    if (this.events.length > 10000) this.events.shift();
  }
}
