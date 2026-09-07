/**
 * Compatibility view for the MemberProfile consolidation.
 *
 * Member profile fields now live directly on Member. This adapter keeps API
 * DTO construction in one place while legacy relation callers are removed.
 */
export type MemberProfileFields = {
  profileCompletenessPercent: number | null;
  heightCm: number | null;
  weightKg: number | null;
  education: string | null;
  maritalStatus: string | null;
  occupation: string | null;
  incomeRange: string | null;
  hometown: string | null;
  currentCity: string | null;
  housingStatus: string | null;
  vehicleStatus: string | null;
  familyBackground: string | null;
  selfDescription: string | null;
  matePreference: string | null;
};

type ProfileCarrier = Partial<MemberProfileFields>;

export function memberProfileView(member: ProfileCarrier): MemberProfileFields {
  return {
    profileCompletenessPercent: member.profileCompletenessPercent ?? 0,
    heightCm: member.heightCm ?? null,
    weightKg: member.weightKg ?? null,
    education: member.education ?? null,
    maritalStatus: member.maritalStatus ?? null,
    occupation: member.occupation ?? null,
    incomeRange: member.incomeRange ?? null,
    hometown: member.hometown ?? null,
    currentCity: member.currentCity ?? null,
    housingStatus: member.housingStatus ?? null,
    vehicleStatus: member.vehicleStatus ?? null,
    familyBackground: member.familyBackground ?? null,
    selfDescription: member.selfDescription ?? null,
    matePreference: typeof member.matePreference === "string" ? member.matePreference : null,
  };
}
