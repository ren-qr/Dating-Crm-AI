import { MemoryTrace } from "./trace";

/**
 * Process-scoped trace sink shared by runtime entry points. It is intentionally
 * inspectable by traceId, while remaining an in-memory MVP implementation.
 */
export const applicationTrace = new MemoryTrace();

export function getApplicationTraceEvents(traceId: string) {
  return applicationTrace.events.filter((event) => event.traceId === traceId);
}
