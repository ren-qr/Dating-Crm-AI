import { z } from "zod";
import { apiResponse, apiSuccess, ApiCode } from "@/lib/server/api-response";
import { publicAiSettings, saveAiConfig } from "@/lib/server/ai/config";
import { requireCurrentEmployee, requirePermission, resolveStoreScope, writeAuditLog } from "@/lib/server/route-helpers";
import { prisma } from "@/lib/server/prisma";

const schema = z.object({
  provider: z.enum(["ollama", "deepseek"]),
  ollamaBaseUrl: z.string().url(),
  ollamaModel: z.string().trim().min(1).max(160),
  deepseekBaseUrl: z.string().url(),
  deepseekModel: z.string().trim().min(1).max(160),
  deepseekApiKey: z.string().trim().max(300).optional(),
});

export async function GET(request: Request) {
  const auth = await requireCurrentEmployee(request);
  if (auth instanceof Response) return auth;
  const forbidden = requirePermission(request, auth, "role:write");
  if (forbidden) return forbidden;
  return apiSuccess(request, await publicAiSettings());
}

export async function PUT(request: Request) {
  const auth = await requireCurrentEmployee(request);
  if (auth instanceof Response) return auth;
  const forbidden = requirePermission(request, auth, "role:write");
  if (forbidden) return forbidden;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiResponse(request, { code: ApiCode.BAD_REQUEST, message: "模型配置参数错误", data: null, status: 400 });
  await saveAiConfig(parsed.data);
  const scope = await resolveStoreScope(request, auth);
  if (scope instanceof Response) return scope;
  await writeAuditLog(prisma, request, auth, { storeId: scope.storeId, action: "UPDATE", resourceType: "AiSettings", metadata: { provider: parsed.data.provider, apiKeyChanged: Boolean(parsed.data.deepseekApiKey) } });
  return apiSuccess(request, await publicAiSettings());
}
