import type { Prisma } from "@prisma/client";
import { decryptSensitivePlaceholder, maskPhone } from "@/lib/server/sensitive-fields";

export type MemberWithReadRelations = Prisma.MemberGetPayload<{
  include: {
    owner: { select: { name: true } };
    sensitiveInfo: true;
    matePreference: true;
    extraProfile: true;
  };
}>;

function formatArea(parts: Array<string | null>) {
  return parts.filter((part): part is string => Boolean(part)).join("-") || null;
}

export function memberToReadDto(member: MemberWithReadRelations, canViewIdentity: boolean) {
  const phone = decryptSensitivePlaceholder(member.sensitiveInfo?.phoneEncrypted ?? null);
  const idCard = decryptSensitivePlaceholder(member.sensitiveInfo?.idCardEncrypted ?? null);

  return {
    id: member.id,
    memberNo: member.memberNo,
    name: member.name,
    phoneMasked: maskPhone(phone),
    phone: canViewIdentity ? phone : null,
    idCardMasked: idCard ? `${idCard.slice(0, 6)}********${idCard.slice(-4)}` : null,
    idCard: canViewIdentity ? idCard : null,
    canEditIdentity: canViewIdentity,
    gender: member.gender,
    birthDate: member.birthDate,
    status: member.status,
    storeId: member.storeId,
    ownerEmployeeId: member.ownerEmployeeId,
    ownerName: member.owner?.name ?? null,
    profileCompletenessPercent: member.profileCompletenessPercent,
    education: member.education,
    heightCm: member.heightCm,
    weightKg: member.weightKg,
    maritalStatus: member.maritalStatus,
    occupation: member.occupation,
    incomeRange: member.incomeRange,
    hometown: formatArea([member.hometownProvince, member.hometownCity, member.hometownDistrict]),
    currentCity: formatArea([member.currentProvince, member.currentCity, member.currentDistrict]),
    hometownProvince: member.hometownProvince,
    hometownCity: member.hometownCity,
    hometownDistrict: member.hometownDistrict,
    currentProvince: member.currentProvince,
    currentCityCode: member.currentCity,
    currentDistrict: member.currentDistrict,
    housingStatus: member.housingStatus,
    vehicleStatus: member.vehicleStatus,
    createdById: member.createdById,
    updatedById: member.updatedById,
    profile: {
      profileCompletenessPercent: member.profileCompletenessPercent,
      education: member.education,
      heightCm: member.heightCm,
      weightKg: member.weightKg,
      maritalStatus: member.maritalStatus,
      occupation: member.occupation,
      incomeRange: member.incomeRange,
      hometownProvince: member.hometownProvince,
      hometownCity: member.hometownCity,
      hometownDistrict: member.hometownDistrict,
      currentProvince: member.currentProvince,
      currentCity: member.currentCity,
      currentDistrict: member.currentDistrict,
      housingStatus: member.housingStatus,
      vehicleStatus: member.vehicleStatus,
      hobbies: member.extraProfile?.storeId === member.storeId ? member.extraProfile.hobbies : null,
      selfDescription: member.extraProfile?.storeId === member.storeId ? member.extraProfile.selfDescription : null,
    },
    matePreferenceDetails: member.matePreference?.storeId === member.storeId
      ? {
          ageMin: member.matePreference.ageMin,
          ageMax: member.matePreference.ageMax,
          genderPreference: member.matePreference.genderPreference,
          educationRequirement: member.matePreference.educationRequirement,
          incomeMinAnnual: member.matePreference.incomeMinAnnual,
          heightMinCm: member.matePreference.heightMinCm,
          heightMaxCm: member.matePreference.heightMaxCm,
          maritalStatusRequirements: member.matePreference.maritalStatusRequirements,
          hasHousing: member.matePreference.hasHousing,
          hasVehicle: member.matePreference.hasVehicle,
          smokingPreference: member.matePreference.smokingPreference,
          drinkingPreference: member.matePreference.drinkingPreference,
        }
      : null,
    createdAt: member.createdAt.toISOString(),
    updatedAt: member.updatedAt.toISOString(),
  };
}
