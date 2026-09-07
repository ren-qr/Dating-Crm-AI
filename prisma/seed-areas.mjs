import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";

const prisma = new PrismaClient();
const source = JSON.parse(await readFile(new URL("./data/area.json", import.meta.url), "utf8"));
const areas = [];

for (const province of source) {
  areas.push({ code: String(province.c), name: province.n, parentCode: null, level: "PROVINCE" });
  for (const city of province.ch ?? []) {
    areas.push({ code: String(city.c), name: city.n, parentCode: String(province.c), level: "CITY" });
    for (const district of city.ch ?? []) {
      areas.push({ code: String(district.c), name: district.n, parentCode: String(city.c), level: "DISTRICT" });
    }
  }
}

await prisma.area.createMany({ data: areas, skipDuplicates: true });
console.log(`Seeded ${areas.length} area records.`);
await prisma.$disconnect();
