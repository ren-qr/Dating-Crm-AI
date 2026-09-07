export type AuditEvent = {
  traceId: string;
  operatorId: string;
  capability: string;
  outcome: string;
  at: string;
};
export interface AuditSink {
  record(event: AuditEvent): Promise<void>;
}
export class MemoryAudit implements AuditSink {
  readonly events: AuditEvent[] = [];
  async record(event: AuditEvent) {
    this.events.push({ ...event });
    if (this.events.length > 10000) this.events.shift();
  }
}
