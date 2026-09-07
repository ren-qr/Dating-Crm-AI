import { request } from "@/interface/shared/client/api-client";

export type AiAssistantConfig = {
  enabled?: boolean;
  provider?: "ollama" | "deepseek" | "mock" | null;
  model?: string | null;
  configured?: boolean;
  greeting?: string;
  modelLabel?: string;
  suggestedPrompts?: string[];
};

export type AiChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type AiChatResponse = {
  status?: string;
  traceId?: string;
  message?: AiChatMessage;
  content?: string;
  conversationId?: string;
  state?: { stateVersion: number; activeFilters: Record<string, unknown> | null; hasActiveQuery: boolean; selectedMember: boolean };
  displayResult?: {
    resultRef: string;
    type: "member_list" | "member_profile";
    items: Array<{
      ref: string;
      name: string;
      age: number | null;
      gender: string;
      occupation: string | null;
      education: string | null;
      currentLocation: { province: string | null; city: string | null; district: string | null } | null;
      navigation: { resultRef: string; itemRef: string };
    }>;
  };
  clarification?: { id: string; field: string; reason: string; question: string; options: Array<{ id: string; label: string }> };
};

export type AiSettings = {
  provider: "ollama" | "deepseek";
  ollamaBaseUrl: string;
  ollamaModel: string;
  deepseekBaseUrl: string;
  deepseekModel: string;
  deepseekApiKeyConfigured: boolean;
};

export async function fetchAiConfig(): Promise<AiAssistantConfig> {
  return request<AiAssistantConfig>("/api/v1/ai/config", { method: "GET" });
}

export async function fetchAiSettings(): Promise<AiSettings> {
  return request<AiSettings>("/api/v1/ai/settings", { method: "GET" });
}

export async function saveAiSettings(input: Omit<AiSettings, "deepseekApiKeyConfigured"> & { deepseekApiKey?: string }): Promise<AiSettings> {
  return request<AiSettings>("/api/v1/ai/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function sendAiChat(input: { message: string; conversationId?: string; clarificationId?: string; clarificationAnswer?: string }): Promise<AiChatResponse> {
  return request<AiChatResponse>("/api/v1/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function fetchAreaNames(codes: string[]): Promise<Record<string, string>> {
  if (!codes.length) return {};
  const areas = await request<Array<{ code: string; name: string }>>(`/api/v1/areas?codes=${encodeURIComponent(codes.join(","))}`, { method: "GET" });
  return Object.fromEntries(areas.map((area) => [area.code, area.name]));
}
