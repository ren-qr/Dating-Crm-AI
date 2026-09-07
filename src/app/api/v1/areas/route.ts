import { z } from "zod";

import { apiResponse, apiSuccess, ApiCode } from "@/lib/server/api-response";
import { prisma } from "@/lib/server/prisma";
import { requireCurrentEmployee } from "@/lib/server/route-helpers";

const querySchema = z.object({
  parentCode: z.string().trim().max(20).optional(),
  level: z.enum(["PROVINCE", "CITY", "DISTRICT"]).optional(),
  codes: z.array(z.string().regex(/^\d{6}$/)).max(150).optional(),
});

export async function GET(request: Request) {
  const auth = await requireCurrentEmployee(request);
  if (auth instanceof Response) return auth;
  const url = new URL(request.url);
  const codes = url.searchParams.get("codes")?.split(",").filter(Boolean);
  const parsed = querySchema.safeParse({ parentCode: url.searchParams.get("parentCode") ?? undefined, level: url.searchParams.get("level") ?? undefined, codes });
  if (!parsed.success) return apiResponse(request, { code: ApiCode.BAD_REQUEST, message: "地区查询参数错误", data: null, status: 400 });
  const areas = await prisma.area.findMany({
    where: { isActive: true, ...(parsed.data.codes?.length ? { code: { in: parsed.data.codes } } : {}), ...(parsed.data.parentCode !== undefined ? { parentCode: parsed.data.parentCode } : {}), ...(parsed.data.level ? { level: parsed.data.level } : {}) },
    orderBy: [{ code: "asc" }],
  });
  return apiSuccess(request, areas.map((area) => ({ code: area.code, name: area.name, parentCode: area.parentCode, level: area.level })));
}
