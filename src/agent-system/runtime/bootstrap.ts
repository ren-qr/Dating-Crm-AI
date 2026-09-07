import type { AuthContext } from "@/lib/server/route-helpers";
import { getAiConfig } from "../shared/ai/config";
import { completeAiText } from "../shared/ai/client";
import { CapabilityRegistry } from "../capabilities/registry";
import { searchCapability } from "../capabilities/tools/search-members";
import { getMemberProfileCapability } from "../capabilities/tools/get-member-profile";
import { searchMembersAdapter } from "../execution/adapters/search-members";
import { getMemberProfileAdapter } from "../execution/adapters/get-member-profile";
import { MemoryStateStore } from "../state/state-store";
import { MemoryTrace } from "../tracing/trace";
import { MemoryAudit } from "../tracing/audit";
import { MemoryEval } from "../tracing/eval-hooks";
import { ModelManager, type Manager } from "./manager";
import { AgentLoop } from "./agent-loop";

const runtime = new AgentLoop({
  registry: new CapabilityRegistry([searchCapability, getMemberProfileCapability]),
  adapters: { search_members: searchMembersAdapter, get_member_profile: getMemberProfileAdapter },
  state: new MemoryStateStore(),
  trace: new MemoryTrace(),
  audit: new MemoryAudit(),
  evalHooks: new MemoryEval(),
});
// Mock is explicit and deterministic; it covers only Phase 1 demo phrasing.
const mockManager: Manager = {
  async decide(view) {
    const text = view.input;
    const args: Record<string, unknown> = {};
    if (/\b男|男性/u.test(text)) args.gender = { kind: "exact", value: "男" };
    if (/\b女|女性/u.test(text)) args.gender = { kind: "exact", value: "女" };
    const range = /(\d{2})\s*(?:到|至|-|—)\s*(\d{2})\s*岁/u.exec(text);
    if (range) {
      args.ageMin = { kind: "exact", value: Number(range[1]) };
      args.ageMax = { kind: "exact", value: Number(range[2]) };
    }
    const around = /(\d{2})\s*岁?左右/u.exec(text);
    if (around) args.age = { kind: "semantic", concept: "around", value: Number(around[1]) };
    const occupation = /(?:职业|做|从事)\s*([\u4E00-\u9FFF]{2,12})/u.exec(text)?.[1];
    if (occupation) args.occupation = { kind: "exact", value: occupation };
    const city = /(上海|北京|广州|深圳|杭州|成都|武汉|南京|苏州)/u.exec(text)?.[1];
    if (city) args.currentLocation = { kind: "exact", value: city };
    return { kind: "capability", request: { capability: "search_members", requestMode: "new_query", args } };
  },
  async respond(view) {
    return `本地 Mock 测试：查询返回 ${Array.isArray(view.result?.items) ? view.result.items.length : 0} 条可访问会员摘要。Mock 不识别自然语言筛选条件。`;
  },
};
export async function runBackofficeTurn(
  input: { message: string; conversationId?: string; clarificationId?: string; clarificationAnswer?: string },
  auth: AuthContext,
  traceId: string,
) {
  const config = await getAiConfig();
  const manager =
    config.provider === "mock"
      ? mockManager
      : new ModelManager((system, content) =>
          completeAiText(
            {
              messages: [
                { role: "system", content: system },
                { role: "user", content },
              ],
            },
            config,
          ),
        );
  return runtime.run(
    input,
    {
      auth,
      operatorId: auth.employee.employeeId,
      storeId: auth.employeeStoreId,
      sessionId: input.conversationId ?? crypto.randomUUID(),
      traceId,
      trustZone:
        config.provider === "mock" || (config.provider === "ollama" && isLoopback(config.baseUrl))
          ? "local"
          : "cloud",
    },
    manager,
  );
}
function isLoopback(baseUrl: string | null) {
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseUrl ?? "").hostname);
  } catch {
    return false;
  }
}
