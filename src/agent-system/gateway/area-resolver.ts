import { prisma } from "@/lib/server/prisma";
import type { GatewayStop } from "../contracts/gateway-result";

export type ResolvedArea = {
  code: string;
  name: string;
  level: "PROVINCE" | "CITY" | "DISTRICT";
};

export class AreaResolver {
  async resolve(value: string): Promise<ResolvedArea | GatewayStop> {
    const input = value.trim();
    if (!input) return clarification("location", "empty_location", "请说明需要筛选的地区。");
    const where = /^\d{6}$/.test(input)
      ? { code: input, isActive: true }
      : { name: { in: areaNameVariants(input) }, isActive: true };
    const candidates = await prisma.area.findMany({ where, take: 3 });
    if (candidates.length === 0) {
      return clarification("location", "area_not_found", "未找到可用地区，请使用省、市或区县名称。");
    }
    if (candidates.length > 1) {
      return clarification("location", "area_ambiguous", "该地区名称不唯一，请补充省、市或区县。");
    }
    const area = candidates[0];
    return { code: area.code, name: area.name, level: area.level };
  }
}

function areaNameVariants(value: string) {
  const stripped = value.replace(/[省市自治区特别行政区]+$/u, "");
  return [...new Set([value, stripped, `${stripped}省`, `${stripped}市`].filter(Boolean))];
}

function clarification(field: string, reason: string, question: string): GatewayStop {
  return {
    status: "ClarificationRequired",
    message: question,
    clarification: { field, reason, question, options: [] },
  };
}
