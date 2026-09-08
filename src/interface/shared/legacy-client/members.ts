import { ApiError, request, type ApiEnvelope, type PaginatedResponse } from "@/interface/shared/client/api-client";

export { ApiError, request };
export type { ApiEnvelope, PaginatedResponse };
/** @deprecated Import AI client types and calls from `@/interface/chat/client/ai-client`. */
export {
  fetchAiConfig,
  fetchAiSettings,
  saveAiSettings,
  sendAiChat,
} from "@/interface/chat/client/ai-client";
/** @deprecated Import AI client types from `@/interface/chat/client/ai-client`. */
export type {
  AiAssistantConfig,
  AiChatMessage,
  AiChatResponse,
  AiSettings,
} from "@/interface/chat/client/ai-client";

export type MemberStatus =
  | "LEAD"
  | "ACTIVE"
  | "MATCHING"
  | "PAUSED"
  | "MARRIED"
  | "REFUNDED"
  | "BLACKLISTED"
  | "ARCHIVED"
  | "PENDING_MATCH"
  | "ACTIVITY_REGISTERED"
  | "PENDING_PAYMENT"
  | "CLOSED"
  | "RISK_REVIEW";

export type Gender = "MALE" | "FEMALE" | "OTHER" | "UNKNOWN";

export type MemberListItem = {
  id: string;
  createdById?: string | null;
  updatedById?: string | null;
  memberNo?: string;
  name: string;
  phoneMasked: string | null;
  /** Present only for the member's assigned consultant. */
  phone?: string | null;
  idCardMasked?: string | null;
  /** Present only for the member's assigned consultant. */
  idCard?: string | null;
  canEditIdentity?: boolean;
  gender?: Gender;
  birthDate?: string | null;
  status: MemberStatus | string;
  storeId?: string;
  ownerEmployeeId?: string;
  storeName?: string;
  ownerName?: string;
  consultantName?: string;
  profileCompletenessPercent?: number;
  education?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  maritalStatus?: string | null;
  occupation?: string | null;
  incomeRange?: string | null;
  hometown?: string | null;
  currentCity?: string | null;
  hometownProvince?: string | null;
  hometownCity?: string | null;
  hometownDistrict?: string | null;
  currentProvince?: string | null;
  currentDistrict?: string | null;
  housingStatus?: string | null;
  vehicleStatus?: string | null;
  selfDescription?: string | null;
  planName?: string;
  lastAction?: string;
  nextAction?: string;
  riskStatus?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type MemberListQuery = {
  keyword?: string;
  name?: string;
  phone?: string;
  memberNo?: string;
  storeId?: string;
  ownerId?: string;
  status?: string;
  sortBy?: "createdAt" | "updatedAt" | "memberNo";
  sortOrder?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export type MemberSearchDraft = {
  age?:
    | { mode: "exact"; value: number }
    | { mode: "bounds"; min?: number; max?: number }
    | { mode: "around"; value: number };
  gender?: Gender;
  currentLocation?: string;
  hometownLocation?: string;
  education?: string;
  occupation?: string;
  incomeRange?: string;
  pageSize?: number;
  unresolved: Array<{ text: string; reason: string }>;
};

export type MemberSearchWorkbenchItem = {
  id: string;
  name: string;
  age: number | null;
  gender: Gender;
  occupation: string | null;
  education: string | null;
  currentLocation: { province: string | null; city: string | null; district: string | null };
};

export type CreateMemberInput = {
  name: string;
  phone?: string;
  gender: Gender;
  storeId?: string;
  ownerEmployeeId?: string;
  birthDate?: string;
  education?: string;
  heightCm?: number;
  weightKg?: number;
  maritalStatus?: string;
  occupation?: string;
  incomeRange?: string;
  hometownProvince?: string;
  hometownCity?: string;
  hometownDistrict?: string;
  currentProvince?: string;
  currentCity?: string;
  currentDistrict?: string;
  housingStatus?: string;
  vehicleStatus?: string;
  selfDescription?: string;
};

export type UpdateMemberInput = Partial<CreateMemberInput> & {
  status?: MemberStatus | string;
  ageMin?: number | null; ageMax?: number | null; genderPreference?: string;
  educationRequirement?: string | null; incomeMinAnnual?: number | null;
  heightMinCm?: number | null; heightMaxCm?: number | null; maritalStatusRequirements?: string[];
  hasHousing?: boolean | null; hasVehicle?: boolean | null; smokingPreference?: string | null; drinkingPreference?: string | null;
};

export type MemberProfile = {
  profileCompletenessPercent?: number;
  education?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  maritalStatus?: string | null;
  occupation?: string | null;
  incomeRange?: string | null;
  hometown?: string | null;
  currentCity?: string | null;
  hometownProvince?: string | null;
  hometownCity?: string | null;
  hometownDistrict?: string | null;
  currentProvince?: string | null;
  currentDistrict?: string | null;
  housingStatus?: string | null;
  vehicleStatus?: string | null;
  hobbies?: string | null;
  selfDescription?: string | null;
};

/** Normalizes legacy nested profile DTOs and the merged flat Member DTO. */
export function getMemberProfileFields(member: MemberDetail | MemberListItem): MemberProfile {
  const legacyProfile = "profile" in member ? member.profile ?? {} : {};

  return {
    ...legacyProfile,
    profileCompletenessPercent: member.profileCompletenessPercent ?? legacyProfile.profileCompletenessPercent,
    education: member.education ?? legacyProfile.education,
    heightCm: member.heightCm ?? legacyProfile.heightCm,
    weightKg: member.weightKg ?? legacyProfile.weightKg,
    maritalStatus: member.maritalStatus ?? legacyProfile.maritalStatus,
    occupation: member.occupation ?? legacyProfile.occupation,
    incomeRange: member.incomeRange ?? legacyProfile.incomeRange,
    hometown: member.hometown ?? legacyProfile.hometown,
    currentCity: member.currentCity ?? legacyProfile.currentCity,
    hometownProvince: member.hometownProvince ?? legacyProfile.hometownProvince,
    hometownCity: member.hometownCity ?? legacyProfile.hometownCity,
    hometownDistrict: member.hometownDistrict ?? legacyProfile.hometownDistrict,
    currentProvince: member.currentProvince ?? legacyProfile.currentProvince,
    currentDistrict: member.currentDistrict ?? legacyProfile.currentDistrict,
    housingStatus: member.housingStatus ?? legacyProfile.housingStatus,
    vehicleStatus: member.vehicleStatus ?? legacyProfile.vehicleStatus,
    hobbies: "profile" in member ? legacyProfile.hobbies : undefined,
    selfDescription: member.selfDescription ?? legacyProfile.selfDescription,
  };
}

export type FollowUpRecord = {
  id: string;
  memberId?: string;
  method?: string;
  content: string;
  nextAction?: string | null;
  nextFollowUpAt?: string | null;
  createdAt: string;
  actorName?: string | null;
};

export type MemberDocumentMeta = {
  id: string;
  type: string;
  fileName: string;
  status?: string;
  createdAt?: string;
};

export type BlacklistEntry = {
  id: string;
  memberId?: string;
  riskType?: string;
  reason: string;
  status: string;
  createdAt?: string;
};

export type AuditLogItem = {
  id: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  actorName?: string | null;
  createdAt: string;
  metadataJson?: Record<string, unknown> | null;
};

export type MemberDetail = MemberListItem & {
  matePreferenceDetails?: {
    ageMin: number | null; ageMax: number | null; genderPreference: string; educationRequirement: string | null;
    incomeMinAnnual: number | null; heightMinCm: number | null; heightMaxCm: number | null;
    maritalStatusRequirements: string[]; hasHousing: boolean | null; hasVehicle: boolean | null;
    smokingPreference: string | null; drinkingPreference: string | null;
  } | null;
  profile?: MemberProfile | null;
  followups?: FollowUpRecord[];
  documents?: MemberDocumentMeta[];
  blacklistEntries?: BlacklistEntry[];
  auditLogs?: AuditLogItem[];
};

export type CreateFollowUpInput = {
  memberId: string;
  method: string;
  content: string;
  nextAction?: string;
  nextFollowUpAt?: string;
};

export type CreateBlacklistInput = {
  memberId: string;
  riskType: string;
  reason: string;
};

export type CurrentEmployee = {
  employeeId: string;
  email?: string | null;
  name?: string | null;
  storeId?: string | null;
  storeName?: string | null;
  roleCodes: string[];
  roleLevel?: StaffLevel;
  roleName?: string;
  permissions: string[];
};

export type MemberOwner = {
  employeeId: string;
  name: string;
  roleName?: string | null;
  roleCodes?: string[];
};

export type AreaOption = { code: string; name: string; parentCode: string | null; level: string };

export async function fetchAreas(parentCode?: string, level?: string): Promise<AreaOption[]> {
  const params = new URLSearchParams();
  if (parentCode) params.set("parentCode", parentCode);
  if (level) params.set("level", level);
  return request<AreaOption[]>(`/api/v1/areas${params.toString() ? `?${params}` : ""}`, { method: "GET" });
}

export type StaffLevel = "manager" | "staff";

type MemberOwnerPayload = {
  storeId?: string | null;
  items: Array<{
    id?: string;
    employeeId?: string;
    name: string;
    roleName?: string | null;
    roleCodes?: string[];
  }>;
};

export type DashboardRecentAudit = {
  id: string;
  action: string;
  resourceType: string;
  createdAt: string;
  actorName?: string | null;
};

export type DashboardOverview = {
  memberTotal: number;
  newMembersToday: number;
  followupsDueToday: number;
  profileIncomplete: number;
  activeBlacklistCount: number;
  recentAudits: DashboardRecentAudit[];
};

export type StaffAccount = {
  id: string;
  storeId: string;
  storeName?: string;
  email: string;
  name: string;
  status: "ACTIVE" | "DISABLED";
  roleCodes: string[];
  roleLevel: StaffLevel;
  roleName: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateStaffInput = {
  email: string;
  name: string;
  password: string;
  roleLevel: "manager" | "staff";
  storeId?: string;
};

export type StoreAccount = {
  id: string;
  name: string;
  address: string;
  phone: string;
  status: "ACTIVE" | "DISABLED" | string;
  employeeCount: number;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
};

export type StoreInput = {
  id?: string;
  name?: string;
  address?: string;
  phone?: string;
  status?: "ACTIVE" | "DISABLED";
};

const API_BASE = "/api/v1/members";

export function canUse(permission: string, employee: CurrentEmployee | null) {
  const permissions = Array.isArray(employee?.permissions) ? employee.permissions : [];
  const roleCodes = Array.isArray(employee?.roleCodes) ? employee.roleCodes : [];

  return Boolean(
    permissions.includes(permission) ||
      roleCodes.includes("bootstrap-admin") ||
      employee?.employeeId === "bootstrap-admin",
  );
}

export function staffLevelOf(employee?: CurrentEmployee | null): StaffLevel {
  if (employee?.roleLevel) {
    return employee.roleLevel;
  }

  const roleCodes = Array.isArray(employee?.roleCodes) ? employee.roleCodes : [];

  if (employee?.employeeId === "bootstrap-admin" || roleCodes.some((code) => ["bootstrap-admin", "admin", "owner", "boss", "store-manager", "store_manager", "manager"].includes(code))) {
    return "manager";
  }

  return "staff";
}

export function staffLevelLabel(employee?: CurrentEmployee | null) {
  const labels: Record<StaffLevel, string> = {
    manager: "管理员",
    staff: "员工",
  };

  return labels[staffLevelOf(employee)];
}

export function canManageStaff(employee?: CurrentEmployee | null) {
  const level = staffLevelOf(employee);
  return Boolean(employee && level === "manager");
}

export async function signOutToCurrentOrigin(
  signOutAction: (options: { redirect: false; callbackUrl: string }) => Promise<unknown>,
  navigate: (url: string) => void = (url) => window.location.assign(url),
) {
  await signOutAction({ redirect: false, callbackUrl: "/" });
  navigate("/");
}

export async function fetchCurrentEmployee(): Promise<CurrentEmployee | null> {
  try {
    const employee = await request<CurrentEmployee>("/api/v1/me", { method: "GET" });

    if (!employee.employeeId || !Array.isArray(employee.permissions) || !Array.isArray(employee.roleCodes)) {
      return null;
    }

    return employee;
  } catch (error) {
    if (error instanceof ApiError && error.code === 1001) {
      return null;
    }

    throw error;
  }
}

export async function fetchDashboardOverview(): Promise<DashboardOverview> {
  return request<DashboardOverview>("/api/v1/dashboard/overview", { method: "GET" });
}

export async function fetchStaffAccounts(): Promise<{ storeId: string; items: StaffAccount[] }> {
  return request<{ storeId: string; items: StaffAccount[] }>("/api/v1/staff", { method: "GET" });
}

export async function createStaffAccount(input: CreateStaffInput): Promise<StaffAccount> {
  return request<StaffAccount>("/api/v1/staff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateStaffAccount(
  id: string,
  input: { status?: StaffAccount["status"]; roleLevel?: "manager" | "staff"; name?: string; email?: string; storeId?: string },
): Promise<StaffAccount> {
  return request<StaffAccount>(`/api/v1/staff/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteStaffAccount(id: string): Promise<{ id: string }> {
  return request<{ id: string }>(`/api/v1/staff/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function fetchStores(): Promise<{ items: StoreAccount[] }> {
  return request<{ items: StoreAccount[] }>("/api/v1/stores", { method: "GET" });
}

export async function createStore(input: Required<Pick<StoreInput, "id" | "name">> & Omit<StoreInput, "id" | "name">): Promise<StoreAccount> {
  return request<StoreAccount>("/api/v1/stores", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateStore(id: string, input: Omit<StoreInput, "id">): Promise<StoreAccount> {
  return request<StoreAccount>(`/api/v1/stores/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteStore(id: string): Promise<{ id: string }> {
  return request<{ id: string }>(`/api/v1/stores/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchMembers(query: MemberListQuery): Promise<PaginatedResponse<MemberListItem>> {
  const params = new URLSearchParams();

  Object.entries({
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 20,
    keyword: query.keyword,
    name: query.name,
    phone: query.phone,
    memberNo: query.memberNo,
    storeId: query.storeId,
    ownerId: query.ownerId,
    status: query.status,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  }).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  });

  return request<PaginatedResponse<MemberListItem>>(`${API_BASE}?${params.toString()}`, {
    method: "GET",
  });
}

export async function quickFillMemberSearch(text: string): Promise<MemberSearchDraft> {
  const payload = await request<{ draft: MemberSearchDraft }>("/api/v1/ai/member-search-draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return payload.draft;
}

export async function searchMembersWorkbench(
  draft: MemberSearchDraft,
  page = 1,
): Promise<PaginatedResponse<MemberSearchWorkbenchItem>> {
  return request<PaginatedResponse<MemberSearchWorkbenchItem>>("/api/v1/members/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draft, page }),
  });
}

export async function createMember(input: CreateMemberInput): Promise<MemberListItem> {
  return request<MemberListItem>(API_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export async function fetchMemberOwners(storeId?: string): Promise<MemberOwner[]> {
  const query = storeId ? `?storeId=${encodeURIComponent(storeId)}` : "";
  const payload = await request<MemberOwner[] | MemberOwnerPayload>(`/api/v1/members/owners${query}`, { method: "GET" });
  const items = Array.isArray(payload) ? payload : payload.items;

  return items
    .map((owner: MemberOwnerPayload["items"][number]) => ({
      employeeId: owner.employeeId ?? owner.id ?? "",
      name: owner.name,
      roleName: owner.roleName,
      roleCodes: owner.roleCodes,
    }))
    .filter((owner) => owner.employeeId);
}

export async function fetchMemberDetail(id: string): Promise<MemberDetail> {
  return request<MemberDetail>(`${API_BASE}/${encodeURIComponent(id)}`, {
    method: "GET",
  });
}

export async function updateMember(id: string, input: UpdateMemberInput): Promise<MemberDetail> {
  return request<MemberDetail>(`${API_BASE}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export async function deleteMember(id: string): Promise<{ id: string }> {
  return request<{ id: string }>(`${API_BASE}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function createFollowUp(input: CreateFollowUpInput): Promise<FollowUpRecord> {
  return request<FollowUpRecord>("/api/v1/followups", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export async function fetchBlacklists(memberId?: string): Promise<PaginatedResponse<BlacklistEntry> | BlacklistEntry[]> {
  const params = new URLSearchParams();
  if (memberId) {
    params.set("memberId", memberId);
  }

  return request<PaginatedResponse<BlacklistEntry> | BlacklistEntry[]>(`/api/v1/blacklists?${params.toString()}`, {
    method: "GET",
  });
}

export async function createBlacklist(input: CreateBlacklistInput): Promise<BlacklistEntry> {
  return request<BlacklistEntry>("/api/v1/blacklists", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export async function fetchAudits(query: {
  resourceType?: string;
  resourceId?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginatedResponse<AuditLogItem> | AuditLogItem[]> {
  const params = new URLSearchParams();
  Object.entries({
    resourceType: query.resourceType,
    resourceId: query.resourceId,
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 10,
  }).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  });

  return request<PaginatedResponse<AuditLogItem> | AuditLogItem[]>(`/api/v1/audits?${params.toString()}`, {
    method: "GET",
  });
}

export function unwrapItems<T>(payload: PaginatedResponse<T> | T[]): T[] {
  return Array.isArray(payload) ? payload : payload.items;
}
