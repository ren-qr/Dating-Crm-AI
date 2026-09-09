import { request } from "@/interface/shared/client/api-client";

export type AiProviderConfig = {
  enabled?: boolean;
  provider?: "ollama" | "deepseek" | "mock" | null;
  model?: string | null;
  configured?: boolean;
  modelLabel?: string;
};

export type AiSettings = {
  provider: "ollama" | "deepseek";
  ollamaBaseUrl: string;
  ollamaModel: string;
  deepseekBaseUrl: string;
  deepseekModel: string;
  deepseekApiKeyConfigured: boolean;
};

export async function fetchAiConfig(): Promise<AiProviderConfig> {
  return request<AiProviderConfig>("/api/v1/ai/config", { method: "GET" });
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
