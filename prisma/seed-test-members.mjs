import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const names = ["林晓", "周宁", "陈安", "许言", "沈悦", "顾晨", "苏禾", "陆川", "江宁", "唐果"];
const cities = [
  ["11", "1101", "110101"],
  ["31", "3101", "310101"],
  ["44", "4401", "440106"],
  ["32", "3201", "320102"],
  ["33", "3301", "330102"],
];
const educations = ["大专", "本科", "硕士", "博士"];
const occupations = ["产品经理", "设计师", "教师", "工程师", "运营专员", "财务"];
const incomes = ["10-20万", "20-30万", "30-50万", "50-100万"];
const maritalStatuses = ["未婚", "未婚", "未婚", "离异"];

const [store, employees] = await Promise.all([
  prisma.store.findFirst({ orderBy: { createdAt: "asc" } }),
  prisma.employee.findMany({ orderBy: { createdAt: "asc" }, take: 9 }),
]);

if (!store || employees.length === 0) {
  throw new Error("需要先存在门店和员工数据，再生成测试会员。");
}

for (let index = 0; index < 100; index += 1) {
  const area = cities[index % cities.length];
  const employee = employees[index % employees.length];
  const gender = index % 2 === 0 ? "FEMALE" : "MALE";
  const memberNo = `TEST-${String(index + 1).padStart(4, "0")}`;
  const memberData = {
    ownerEmployeeId: employee.id,
    name: `${names[index % names.length]}${Math.floor(index / names.length) + 1}`,
    gender,
    birthDate: `${1988 + (index % 12)}-${String((index % 12) + 1).padStart(2, "0")}-15`,
    status: index % 10 === 0 ? "LEAD" : "ACTIVE",
    heightCm: gender === "MALE" ? 168 + (index % 15) : 158 + (index % 12),
    weightKg: gender === "MALE" ? 62 + (index % 18) : 48 + (index % 14),
    education: educations[index % educations.length],
    occupation: occupations[index % occupations.length],
    incomeRange: incomes[index % incomes.length],
    maritalStatus: maritalStatuses[index % maritalStatuses.length],
    housingStatus: index % 3 === 0 ? "有房" : "租住",
    vehicleStatus: index % 2 === 0 ? "有车" : "无车",
    hometownProvince: area[0],
    hometownCity: area[1],
    hometownDistrict: area[2],
    currentProvince: area[0],
    currentCity: area[1],
    currentDistrict: area[2],
    profileCompletenessPercent: 100,
    createdById: employee.id,
    updatedById: employee.id,
  };
  await prisma.member.upsert({
    where: { storeId_memberNo: { storeId: store.id, memberNo } },
    update: memberData,
    create: {
      storeId: store.id,
      memberNo,
      ...memberData,
    },
  });
}

console.log("Generated 100 test members.");
await prisma.$disconnect();
