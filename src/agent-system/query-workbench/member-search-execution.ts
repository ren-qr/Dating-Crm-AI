import { CapabilityRegistry, type RawResult } from "../capabilities/registry";
import { searchCapability } from "../capabilities/tools/search-members";
import { Executor } from "../execution/executor";
import { searchMembersAdapter } from "../execution/adapters/search-members";
import { CapabilityGateway } from "../gateway/capability-gateway";
import { applyResultPolicy, buildAuthorizedDisplayResult, scopedRows } from "../result/result-policy";
import type { RuntimeContext } from "../runtime/runtime-context";
import { MemoryTrace } from "../tracing/trace";
import { resolveMemberSearchDraft, type MemberSearchDraft } from "./member-search-draft";

export type MemberSearchWorkbenchResult = {
  items: Array<{
    id: string;
    name: string;
    age: number | null;
    gender: string;
    occupation: string | null;
    education: string | null;
    currentLocation: { province: string | null; city: string | null; district: string | null };
  }>;
  page: number;
  pageSize: number;
  total: number;
  hasNext: boolean;
};

export async function executeMemberSearchDraft(
  draft: MemberSearchDraft,
  page: number,
  context: RuntimeContext,
): Promise<MemberSearchWorkbenchResult | { status: string; message: string }> {
  const resolved = await resolveMemberSearchDraft(draft);
  if ("status" in resolved) return resolved;

  const trace = new MemoryTrace();
  const registry = new CapabilityRegistry([searchCapability]);
  const gateway = new CapabilityGateway(registry, trace);
  const gatewayResult = await gateway.resolveStructuredSearch({
    ...resolved.filters,
    page,
  }, context);
  if (gatewayResult.status !== "ResolvedAction") return gatewayResult;

  const raw = await new Executor(registry, gateway, { search_members: searchMembersAdapter })
    .execute(gatewayResult.action, context);
  // Both policy products are applied. The safe result remains the only result
  // eligible for a model; this browser-only projection uses the authorized
  // display policy and keeps an ID solely for the existing detail endpoint.
  applyResultPolicy(raw, searchCapability, context, trace);
  const display = buildAuthorizedDisplayResult(raw, context, `workbench-${context.traceId}`, "member_list");
  return workbenchResult(raw, display.items, context);
}

function workbenchResult(
  raw: RawResult,
  displayItems: Array<Record<string, unknown>>,
  context: RuntimeContext,
): MemberSearchWorkbenchResult {
  const rows = scopedRows(raw, context);
  const items = displayItems.map((display, index) => {
    const data = rows[index]?.data ?? {};
    return {
      id: String(data.memberId),
      name: String(display.name ?? ""),
      age: typeof display.age === "number" ? display.age : null,
      gender: String(display.gender ?? "UNKNOWN"),
      occupation: typeof display.occupation === "string" ? display.occupation : null,
      education: typeof display.education === "string" ? display.education : null,
      currentLocation: (display.currentLocation as MemberSearchWorkbenchResult["items"][number]["currentLocation"]) ?? {
        province: null,
        city: null,
        district: null,
      },
    };
  });
  return {
    items,
    page: Number(raw.meta.page ?? 1),
    pageSize: Number(raw.meta.pageSize ?? 10),
    total: Number(raw.meta.total ?? items.length),
    hasNext: Boolean(raw.meta.hasNext),
  };
}
