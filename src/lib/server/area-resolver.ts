import { prisma } from "@/lib/server/prisma";

export type ResolvedArea = {
  code: string;
  name: string;
  level: "PROVINCE" | "CITY" | "DISTRICT";
};

export type AreaResolutionStop = {
  status: "ClarificationRequired";
  message: string;
  clarification: {
    field: string;
    reason: string;
    question: string;
    options: Array<{ id: string; label: string }>;
  };
};

/** Resolves display names and the database's 2/4/6-digit Area codes. */
export class AreaResolver {
  async resolve(value: string): Promise<ResolvedArea | AreaResolutionStop> {
    const input = value.trim();
    if (!input) return clarification("location", "empty_location", "请说明需要筛选的地区。");
    const codeLevel = areaLevelForCode(input);
    const where = codeLevel
      ? { code: input, level: codeLevel, isActive: true }
      : { name: { in: areaNameVariants(input) }, isActive: true };
    const candidates = await prisma.area.findMany({ where, take: 3 });
    if (candidates.length === 0) {
      return clarification("location", "area_not_found", "未找到可用地区，请使用省、市或区县名称。");
    }
    const area = selectUnambiguousArea(candidates);
    if (!area) {
      return clarification("location", "area_ambiguous", "该地区名称不唯一，请补充省、市或区县。");
    }
    return { code: area.code, name: area.name, level: area.level };
  }
}

function areaLevelForCode(value: string): ResolvedArea["level"] | null {
  if (/^\d{2}$/.test(value)) return "PROVINCE";
  if (/^\d{4}$/.test(value)) return "CITY";
  if (/^\d{6}$/.test(value)) return "DISTRICT";
  return null;
}

function selectUnambiguousArea<T extends ResolvedArea & { parentCode: string | null }>(areas: T[]): T | null {
  if (areas.length === 1) return areas[0];
  const province = areas.find((area) => area.level === "PROVINCE");
  const city = areas.find(
    (area) => area.level === "CITY" && area.parentCode === province?.code && area.name === province.name,
  );
  return province && city && areas.length === 2 ? city : null;
}

function areaNameVariants(value: string) {
  const stripped = value.replace(/[省市自治区特别行政区]+$/u, "");
  return [...new Set([value, stripped, `${stripped}省`, `${stripped}市`].filter(Boolean))];
}

function clarification(field: string, reason: string, question: string): AreaResolutionStop {
  return {
    status: "ClarificationRequired",
    message: question,
    clarification: { field, reason, question, options: [] },
  };
}
