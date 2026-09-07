CREATE TYPE "AreaLevel" AS ENUM ('PROVINCE', 'CITY', 'DISTRICT');

CREATE TABLE "Area" (
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "parentCode" TEXT,
  "level" "AreaLevel" NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Area_pkey" PRIMARY KEY ("code")
);

CREATE INDEX "Area_parentCode_level_idx" ON "Area"("parentCode", "level");
CREATE INDEX "Area_level_isActive_idx" ON "Area"("level", "isActive");
