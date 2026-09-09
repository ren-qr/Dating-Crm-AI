import type { AiConfig } from "./config";
import { assertSafeModelText } from "./privacy";

export type AiMessage = { role: "system" | "user" | "assistant"; content: string };
export type AiCompleteInput = { messages: AiMessage[] };

export class AiProviderError extends Error {
  constructor(message: string) { super(message); this.name = "AiProviderError"; }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...init, signal: controller.signal }); } finally { clearTimeout(timeout); }
}

export async function completeAiText(input: AiCompleteInput, config: AiConfig): Promise<string> {
  if (!config.configured || !config.provider) throw new AiProviderError("AI 模型尚未配置");
  const serialized = input.messages.map((message) => message.content).join("\n");
  if (config.provider === "deepseek") assertSafeModelText(serialized, "云端请求");
  const checkedAnswer = (answer: string) => {
    if (config.provider === "deepseek") assertSafeModelText(answer, "云端响应");
    return answer;
  };
  if (config.provider === "mock") {
    const latestUserMessage = input.messages.findLast((message) => message.role === "user");
    return `这是本地 mock AI 回复：${latestUserMessage?.content ?? "我已收到请求。"}\n\n请人工确认后再执行关键业务动作。`;
  }
  if (config.provider === "deepseek") {
    const response = await fetchWithTimeout(`${config.baseUrl}/chat/completions`, {
      method: "POST", headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.model, messages: input.messages, temperature: config.temperature, thinking: { type: "disabled" }, stream: false }),
    }, config.timeoutMs);
    const payload = await response.json().catch(() => null) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } } | null;
    if (!response.ok) throw new AiProviderError(payload?.error?.message ?? `DeepSeek 调用失败：${response.status}`);
    const answer = payload?.choices?.[0]?.message?.content;
    if (!answer) throw new AiProviderError("DeepSeek 未返回有效回答");
    return checkedAnswer(answer);
  }
  if (config.provider === "ollama") {
    const response = await fetchWithTimeout(`${config.baseUrl}/api/chat`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.model, messages: input.messages, stream: false, options: { temperature: config.temperature } }),
    }, config.timeoutMs);
    const payload = await response.json().catch(() => null) as { message?: { content?: string }; error?: string } | null;
    if (!response.ok) {
      const detail = payload?.error ?? `Ollama 调用失败：${response.status}`;
      throw new AiProviderError(detail.includes("model") && detail.includes("not found") ? `本地模型未找到：${config.model}，请在 Ollama 中确认模型名称后重新保存。` : detail);
    }
    const answer = payload?.message?.content;
    if (!answer) throw new AiProviderError("Ollama 未返回有效回答");
    return checkedAnswer(answer);
  }
  throw new AiProviderError("不支持的 AI Provider");
}
