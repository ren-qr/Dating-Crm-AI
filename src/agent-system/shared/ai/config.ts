import { decryptSensitivePlaceholder, encryptSensitiveValue } from "@/lib/server/sensitive-fields";
import { prisma } from "@/lib/server/prisma";

export type AiProvider = "ollama" | "deepseek" | "mock";

export async function saveAiConfig(input: { provider: "ollama" | "deepseek"; ollamaBaseUrl: string; ollamaModel: string; deepseekBaseUrl: string; deepseekModel: string; deepseekApiKey?: string }) {
  const existing = await prisma.aiSetting.findUnique({ where: { id: "default" } });
  const encryptedKey = input.deepseekApiKey ? encryptSensitiveValue(input.deepseekApiKey) : existing?.cloudApiKeyEncrypted;
  await prisma.aiSetting.upsert({ where: { id: "default" }, create: { id: "default", provider: input.provider, ollamaBaseUrl: input.ollamaBaseUrl, ollamaModel: input.ollamaModel, cloudBaseUrl: input.deepseekBaseUrl, cloudModel: input.deepseekModel, cloudApiKeyEncrypted: encryptedKey }, update: { provider: input.provider, ollamaBaseUrl: input.ollamaBaseUrl, ollamaModel: input.ollamaModel, cloudBaseUrl: input.deepseekBaseUrl, cloudModel: input.deepseekModel, cloudApiKeyEncrypted: encryptedKey } });
}

function effectiveEnv(name: string, value?: string) { return value || process.env[name]?.trim() || ""; }

export type AiConfig = {
  enabled: boolean;
  provider: AiProvider | null;
  model: string | null;
  configured: boolean;
  baseUrl: string | null;
  timeoutMs: number;
  temperature: number;
  apiKey?: string;
};

function readNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function getAiConfig(): Promise<AiConfig> {
  const database = await prisma.aiSetting.findUnique({ where: { id: "default" } });
  const provider = (database?.provider || process.env.AI_PROVIDER?.trim()) as AiProvider | undefined;
  const timeoutMs = readNumber(process.env.AI_TIMEOUT_MS, 30000);
  const temperature = readNumber(process.env.AI_TEMPERATURE, 0.2);

  if (provider === "mock") {
    return {
      enabled: true,
      provider,
      model: "mock-ai",
      configured: true,
      baseUrl: null,
      timeoutMs,
      temperature,
    };
  }

  if (provider === "ollama") {
    const baseUrl = effectiveEnv("OLLAMA_BASE_URL", database?.ollamaBaseUrl) || "http://127.0.0.1:11434";
    const model = effectiveEnv("OLLAMA_MODEL", database?.ollamaModel) || null;

    return {
      enabled: Boolean(model),
      provider,
      model,
      configured: Boolean(baseUrl && model),
      baseUrl,
      timeoutMs,
      temperature,
    };
  }

  if (provider === "deepseek") {
    const baseUrl = effectiveEnv("DEEPSEEK_BASE_URL", database?.cloudBaseUrl) || "https://api.deepseek.com";
    const model = effectiveEnv("DEEPSEEK_MODEL", database?.cloudModel) || "";
    const savedKey = database?.cloudApiKeyEncrypted ? decryptSensitivePlaceholder(database.cloudApiKeyEncrypted) : null;
    const configured = Boolean((savedKey || process.env.DEEPSEEK_API_KEY?.trim()) && baseUrl && model);

    return {
      enabled: configured,
      provider,
      model,
      configured,
      baseUrl,
      timeoutMs,
      temperature,
      apiKey: savedKey || process.env.DEEPSEEK_API_KEY?.trim(),
    };
  }

  return {
    enabled: false,
    provider: null,
    model: null,
    configured: false,
    baseUrl: null,
    timeoutMs,
    temperature,
  };
}

export function publicAiConfig(config: AiConfig) {
  return {
    enabled: config.enabled,
    provider: config.provider,
    model: config.model,
    configured: config.configured,
  };
}

export async function publicAiSettings() {
  const database = await prisma.aiSetting.findUnique({ where: { id: "default" } });
  return { provider: database?.provider || process.env.AI_PROVIDER || "ollama", ollamaBaseUrl: database?.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434", ollamaModel: database?.ollamaModel || process.env.OLLAMA_MODEL || "qwen3.6:35b", deepseekBaseUrl: database?.cloudBaseUrl || process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com", deepseekModel: database?.cloudModel || process.env.DEEPSEEK_MODEL || "deepseek-chat", deepseekApiKeyConfigured: Boolean(database?.cloudApiKeyEncrypted || process.env.DEEPSEEK_API_KEY) };
}
