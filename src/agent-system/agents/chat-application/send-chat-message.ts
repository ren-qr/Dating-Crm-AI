import { completeAiText, AiProviderError } from "@/agent-system/shared/ai/client";
import { getAiConfig } from "@/agent-system/shared/ai/config";

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

/** @deprecated Isolated legacy chat. The application entry uses runtime/bootstrap. */
export async function sendChatMessage(messages: ChatMessage[]): Promise<string> {
  const config = await getAiConfig();

  try {
    return await completeAiText({
      messages: [
        {
          role: "system",
          content: "你是 Meetra 婚恋门店后台的 AI 红娘助手。当前版本只提供一般性咨询、分析与文案协助；不访问会员数据库，不执行业务操作，也不承诺婚恋结果。不要索取或复述手机号、身份证等敏感信息。",
        },
        ...messages,
      ],
    }, config);
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    throw new AiProviderError("AI 助理暂时不可用");
  }
}
