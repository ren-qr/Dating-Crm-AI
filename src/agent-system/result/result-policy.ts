import type { CapabilityDefinition, RawResult } from "../capabilities/registry";
import type { AuthorizedDisplayResult } from "../contracts/authorized-display-result";
import type { SafeResult } from "../contracts/safe-result";
import type { RuntimeContext } from "../runtime/runtime-context";
import { redactSensitiveText } from "../shared/ai/privacy";
import type { TraceSink } from "../tracing/trace";

const safeApprovals = new WeakMap<
  object,
  { sessionId: string; operatorId: string; storeId: string | null }
>();
const displayApprovals = new WeakSet<object>();

export function assertSafeResult(result: SafeResult, context: RuntimeContext) {
  const owner = safeApprovals.get(result);
  if (
    !owner ||
    owner.sessionId !== context.sessionId ||
    owner.operatorId !== context.operatorId ||
    owner.storeId !== context.storeId ||
    result.requestId !== context.traceId ||
    result.trustZone !== context.trustZone
  ) {
    throw new Error("Unfiltered result");
  }
}

export function assertAuthorizedDisplayResult(result: AuthorizedDisplayResult) {
  if (!displayApprovals.has(result)) throw new Error("Unapproved display result");
}

export function applyResultPolicy(
  raw: RawResult,
  definition: CapabilityDefinition,
  context: RuntimeContext,
  trace: TraceSink,
): SafeResult {
  const rows = scopedRows(raw, context);
  trace.record(context.traceId, "row_permission", { before: raw.rows.length, after: rows.length });
  const fields = definition.resultFields[context.trustZone];
  const names = rows
    .map((row) => row.data.name)
    .filter((name): name is string => typeof name === "string");
  const data = rows.map((row, index) => ({
    ref: `item-${index + 1}`,
    ...Object.fromEntries(
      fields
        .filter((key) => Object.hasOwn(row.data, key))
        .map((key) => [key, sanitize(row.data[key], context.trustZone === "cloud" ? names : [])]),
    ),
  }));
  trace.record(context.traceId, "field_permission", { fields, count: data.length });
  trace.record(context.traceId, "sensitive_masking", { removed: ["memberId", "memberNo", "phone", "idCard", "hash"] });
  trace.record(context.traceId, "trust_filter", context.trustZone);
  const meta = rows.length === raw.rows.length ? raw.meta : { returnedCount: rows.length };
  const safe = {
    capability: definition.name,
    requestId: context.traceId,
    trustZone: context.trustZone,
    data: { items: data, meta: sanitize(meta, []) },
  } as unknown as SafeResult;
  freeze(safe);
  safeApprovals.set(safe, {
    sessionId: context.sessionId,
    operatorId: context.operatorId,
    storeId: context.storeId,
  });
  return safe;
}

/**
 * Display output is created from the same scoped rows but is never accepted by
 * ContextBuilder. It intentionally exposes no internal id: navigation remains
 * bound to resultRef + item-N in server WorkingState.
 */
export function buildAuthorizedDisplayResult(
  raw: RawResult,
  context: RuntimeContext,
  resultRef: string,
  type: "member_list" | "member_profile",
): AuthorizedDisplayResult {
  const rows = scopedRows(raw, context);
  const display = {
    resultRef,
    type,
    items: rows.map((row, index) => ({
      ref: `item-${index + 1}`,
      name: typeof row.data.name === "string" ? redactSensitiveText(row.data.name) : "",
      age: row.data.age ?? null,
      gender: row.data.gender ?? "UNKNOWN",
      occupation: row.data.occupation ?? null,
      education: row.data.education ?? null,
      currentLocation: row.data.currentLocation ?? null,
      navigation: { resultRef, itemRef: `item-${index + 1}` },
    })),
  } as unknown as AuthorizedDisplayResult;
  freeze(display);
  displayApprovals.add(display);
  return display;
}

export function scopedRows(raw: RawResult, context: RuntimeContext) {
  return raw.rows.filter(
    (row) => row.storeId === context.storeId && row.ownerId === context.operatorId,
  );
}

function sanitize(value: unknown, names: string[]): unknown {
  if (typeof value === "string") return redactSensitiveText(value, names).slice(0, 1000);
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitize(item, names));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitize(item, names)]),
    );
  }
  return value;
}
function freeze(value: unknown) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
}
