import type { MemberQuery } from "@/ai-query/member-query-contract";
import type { MemberQueryResult, MemberQueryStop } from "@/ai-query/execute-member-query";
import { request } from "@/interface/shared/client/api-client";

export type AssistantConversationMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  action?: { type: "reply" } | { type: "query_members"; query: MemberQuery };
  result?: MemberQueryResult;
  stop?: MemberQueryStop;
};

type AssistantRequestMessage = Pick<AssistantConversationMessage, "role" | "content">;

export type AssistantResponse = {
  action: { type: "reply" } | { type: "query_members"; query: MemberQuery };
  content: string;
  result?: MemberQueryResult;
  stop?: MemberQueryStop;
};

export async function sendAssistantMessages(messages: AssistantRequestMessage[]): Promise<AssistantResponse> {
  return request<AssistantResponse>("/api/v1/ai/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
}
