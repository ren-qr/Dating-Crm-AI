import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const members = await prisma.member.findMany({ orderBy: { memberNo: "asc" }, take: 100 });
for (let index = 0; index < members.length; index += 1) {
  const member = members[index];
  await prisma.memberMatePreference.upsert({
    where: { memberId: member.id },
    update: {},
    create: {
      memberId: member.id,
      storeId: member.storeId,
      ageMin: 25 + (index % 5), ageMax: 32 + (index % 8),
      genderPreference: member.gender === "MALE" ? "FEMALE" : member.gender === "FEMALE" ? "MALE" : "OPPOSITE",
      educationRequirement: index % 3 === 0 ? "本科" : "大专及以上",
      incomeMinAnnual: 100000 + (index % 5) * 50000,
      heightMinCm: member.gender === "MALE" ? 155 : 165, heightMaxCm: member.gender === "MALE" ? 180 : 185,
      maritalStatusRequirements: index % 4 === 0 ? ["未婚", "离异"] : ["未婚"],
      hasHousing: index % 3 === 0, hasVehicle: index % 2 === 0,
      smokingPreference: index % 3 === 0 ? "不接受" : "不限",
      drinkingPreference: index % 4 === 0 ? "少量" : "不限",
    },
  });
}
console.log(`Generated mate preferences for ${members.length} members.`);
await prisma.$disconnect();
