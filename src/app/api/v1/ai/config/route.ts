import { apiSuccess } from "@/lib/server/api-response";
import { getAiConfig, publicAiConfig } from "@/lib/server/ai/config";
import { requireCurrentEmployee } from "@/lib/server/route-helpers";

export async function GET(request: Request) {
  const auth = await requireCurrentEmployee(request);

  if (auth instanceof Response) {
    return auth;
  }

  const config = publicAiConfig(await getAiConfig());

  return apiSuccess(request, {
    ...config,
    modelLabel: config.configured && config.provider && config.model
      ? `${config.provider} / ${config.model}`
      : "AI 模型未配置",
  });
}
