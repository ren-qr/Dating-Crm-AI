import { describe, expect, it, vi } from "vitest";

import { ApiCode, apiResponse, apiSuccess } from "@/lib/server/api-response";

type Employee = {
  employeeId: string;
  storeId: string;
  roleLevel: "owner" | "manager" | "staff";
  permissions: string[];
};

type MemberDetail = {
  id: string;
  memberNo: string;
  name: string;
  phoneMasked: string | null;
  emailMasked: string | null;
  gender: "MALE" | "FEMALE" | "OTHER" | "UNKNOWN";
  status: string;
  storeId: string;
  ownerEmployeeId: string;
  profile: {
    education: string | null;
    heightCm: number | null;
    maritalStatus: string | null;
    profileCompletenessPercent: number;
  };
  createdAt: string;
  updatedAt: string;
};

const authorized: Employee = {
  employeeId: "emp_1",
  storeId: "store_1",
  roleLevel: "staff",
  permissions: [
    "member:read",
    "member:write",
    "followup:write",
    "blacklist:read",
    "blacklist:write",
    "audit:read",
  ],
};

const memberDetail: MemberDetail = {
  id: "member_1",
  memberNo: "MSTORE1001",
  name: "张三",
  phoneMasked: "138****8000",
  emailMasked: "zh***@example.com",
  gender: "FEMALE",
  status: "ACTIVE",
  storeId: "store_1",
  ownerEmployeeId: "emp_1",
  profile: {
    education: "本科",
    heightCm: 168,
    maritalStatus: "未婚",
    profileCompletenessPercent: 86,
  },
  createdAt: "2026-07-11T01:00:00.000Z",
  updatedAt: "2026-07-11T02:00:00.000Z",
};

function request(pathname: string, requestId: string, init?: RequestInit) {
  return new Request(`https://example.test${pathname}`, {
    ...init,
    headers: {
      "x-request-id": requestId,
      ...(init?.headers ?? {}),
    },
  });
}

function hasPermission(employee: Employee | null, permission: string) {
  return Boolean(employee?.permissions.includes(permission));
}

function requireEmployee(
  req: Request,
  employee: Employee | null,
  permission: string,
) {
  if (!employee) {
    return apiResponse(req, {
      code: ApiCode.UNAUTHENTICATED,
      message: "未认证",
      data: null,
      status: 401,
    });
  }

  if (!hasPermission(employee, permission)) {
    return apiResponse(req, {
      code: ApiCode.FORBIDDEN,
      message: "无权限",
      data: null,
      status: 403,
    });
  }

  return null;
}

async function mockGetMemberDetail(options: {
  employee: Employee | null;
  memberStoreId?: string;
}) {
  const req = request("/api/v1/members/member_1", "req_member_detail");
  const authError = requireEmployee(req, options.employee, "member:read");
  if (authError) {
    return authError;
  }

  return apiSuccess(req, {
    ...memberDetail,
    storeId: options.memberStoreId ?? memberDetail.storeId,
  });
}

async function mockPatchMemberDetail(options: {
  employee: Employee | null;
  body: Record<string, unknown>;
  memberStoreId?: string;
  auditCreate?: ReturnType<typeof vi.fn>;
  blacklistHit?: boolean;
}) {
  const req = request("/api/v1/members/member_1", "req_member_patch", {
    method: "PATCH",
    body: JSON.stringify(options.body),
  });
  const authError = requireEmployee(req, options.employee, "member:write");
  if (authError) {
    return authError;
  }

  if (
    options.memberStoreId &&
    options.memberStoreId !== options.employee?.storeId &&
    options.employee?.roleLevel !== "owner"
  ) {
    return apiResponse(req, {
      code: ApiCode.FORBIDDEN,
      message: options.employee?.roleLevel === "manager" ? "P2只能编辑当前门店会员" : "P1只能编辑归属自己的会员",
      data: null,
      status: 403,
    });
  }

  if (typeof options.body.name !== "string" || options.body.name.trim() === "") {
    return apiResponse(req, {
      code: ApiCode.BAD_REQUEST,
      message: "参数错误",
      data: null,
      status: 400,
    });
  }

  if (options.blacklistHit) {
    return apiResponse(req, {
      code: ApiCode.BLACKLIST_BLOCKED,
      message: "黑名单拦截",
      data: {
        reason: "手机号命中 ACTIVE 黑名单",
        blockedFields: ["phone"],
      },
      status: 409,
    });
  }

  options.auditCreate?.({
    action: "UPDATE",
    resourceType: "Member",
    resourceId: "member_1",
    requestId: "req_member_patch",
    metadataJson: {
      changedFields: ["name"],
      beforeSummary: { name: "张三" },
      afterSummary: { name: "李四" },
    },
  });

  return apiSuccess(req, {
    ...memberDetail,
    name: "李四",
    updatedAt: "2026-07-11T03:00:00.000Z",
  });
}

async function mockPostFollowup(options: {
  employee: Employee | null;
  body: Record<string, unknown>;
  memberStoreId?: string;
  auditCreate?: ReturnType<typeof vi.fn>;
  blacklistHit?: boolean;
}) {
  const req = request("/api/v1/followups", "req_followup_create", {
    method: "POST",
    body: JSON.stringify(options.body),
  });
  const authError = requireEmployee(req, options.employee, "followup:write");
  if (authError) {
    return authError;
  }

  if (!options.body.memberId || !options.body.content) {
    return apiResponse(req, {
      code: ApiCode.BAD_REQUEST,
      message: "参数错误",
      data: null,
      status: 400,
    });
  }

  if (options.memberStoreId && options.memberStoreId !== options.employee?.storeId) {
    return apiResponse(req, {
      code: ApiCode.FORBIDDEN,
      message: "无权限访问该会员",
      data: null,
      status: 403,
    });
  }

  if (options.blacklistHit) {
    return apiResponse(req, {
      code: ApiCode.BLACKLIST_BLOCKED,
      message: "黑名单拦截",
      data: {
        reason: "会员处于 ACTIVE 黑名单",
        blockedActions: ["followup:create"],
      },
      status: 409,
    });
  }

  options.auditCreate?.({
    action: "CREATE",
    resourceType: "FollowUpRecord",
    resourceId: "followup_1",
    requestId: "req_followup_create",
  });

  return apiResponse(req, {
    code: ApiCode.OK,
    message: "创建成功",
    data: {
      id: "followup_1",
      memberId: "member_1",
      storeId: "store_1",
      contentSummary: "邀约到店沟通",
      nextFollowUpAt: "2026-07-12T02:00:00.000Z",
    },
    status: 201,
  });
}

async function mockGetBlacklists(options: {
  employee: Employee | null;
  query?: string;
}) {
  const req = request(`/api/v1/blacklists${options.query ?? ""}`, "req_blacklists_get");
  const authError = requireEmployee(req, options.employee, "blacklist:read");
  if (authError) {
    return authError;
  }

  const url = new URL(req.url);
  const storeId = url.searchParams.get("storeId") ?? options.employee?.storeId;

  if (storeId !== options.employee?.storeId) {
    return apiResponse(req, {
      code: ApiCode.FORBIDDEN,
      message: "无权限访问该门店",
      data: null,
      status: 403,
    });
  }

  return apiSuccess(req, {
    items: [
      {
        id: "blacklist_1",
        storeId,
        memberId: "member_1",
        phoneMasked: "138****8000",
        idCardMasked: "310***********1234",
        reason: "投诉欺诈",
        severity: "HIGH",
        status: "ACTIVE",
        createdAt: "2026-07-11T01:00:00.000Z",
      },
    ],
    page: 1,
    pageSize: 20,
    total: 1,
    hasNext: false,
  });
}

async function mockPostBlacklist(options: {
  employee: Employee | null;
  body: Record<string, unknown>;
  auditCreate?: ReturnType<typeof vi.fn>;
}) {
  const req = request("/api/v1/blacklists", "req_blacklist_create", {
    method: "POST",
    body: JSON.stringify(options.body),
  });
  const authError = requireEmployee(req, options.employee, "blacklist:write");
  if (authError) {
    return authError;
  }

  if (!options.body.storeId || !options.body.reason || !options.body.phone) {
    return apiResponse(req, {
      code: ApiCode.BAD_REQUEST,
      message: "参数错误",
      data: null,
      status: 400,
    });
  }

  if (options.body.storeId !== options.employee?.storeId) {
    return apiResponse(req, {
      code: ApiCode.FORBIDDEN,
      message: "无权限访问该门店",
      data: null,
      status: 403,
    });
  }

  options.auditCreate?.({
    action: "CREATE",
    resourceType: "BlacklistEntry",
    resourceId: "blacklist_1",
    requestId: "req_blacklist_create",
  });

  return apiResponse(req, {
    code: ApiCode.OK,
    message: "创建成功",
    data: {
      id: "blacklist_1",
      storeId: "store_1",
      phoneMasked: "138****8000",
      phoneHash: undefined,
      reason: "投诉欺诈",
      severity: "HIGH",
      status: "ACTIVE",
    },
    status: 201,
  });
}

async function mockGetAudits(options: {
  employee: Employee | null;
  query?: string;
}) {
  const req = request(`/api/v1/audits${options.query ?? ""}`, "req_audits_get");
  const authError = requireEmployee(req, options.employee, "audit:read");
  if (authError) {
    return authError;
  }

  const url = new URL(req.url);
  const storeId = url.searchParams.get("storeId") ?? options.employee?.storeId;

  if (storeId !== options.employee?.storeId) {
    return apiResponse(req, {
      code: ApiCode.FORBIDDEN,
      message: "无权限访问该门店",
      data: null,
      status: 403,
    });
  }

  return apiSuccess(req, {
    items: [
      {
        id: "audit_1",
        storeId,
        actorEmployeeId: "emp_1",
        action: "UPDATE",
        resourceType: "Member",
        resourceId: "member_1",
        requestId: "req_member_patch",
        metadataJson: {
          changedFields: ["name"],
          beforeSummary: { name: "张三" },
          afterSummary: { name: "李四" },
        },
        createdAt: "2026-07-11T03:00:00.000Z",
      },
    ],
    page: 1,
    pageSize: 20,
    total: 1,
    hasNext: false,
  });
}

describe("GET/PATCH /api/v1/members/[id] contract", () => {
  it("returns sanitized member detail and never exposes raw sensitive fields", async () => {
    const response = await mockGetMemberDetail({ employee: authorized });
    const body = await response.json();
    const serialized = JSON.stringify(body.data);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      code: 0,
      requestId: "req_member_detail",
      data: {
        id: "member_1",
        name: "张三",
        phoneMasked: "138****8000",
        emailMasked: "zh***@example.com",
      },
    });
    expect(serialized).not.toContain("13800138000");
    expect(serialized).not.toContain("zhangsan@example.com");
    expect(serialized).not.toContain("nameEncrypted");
    expect(serialized).not.toContain("phoneHash");
  });

  it("covers auth, permission, store isolation, zod validation, blacklist blocking, and audit write", async () => {
    const auditCreate = vi.fn();

    const unauthenticated = await mockGetMemberDetail({ employee: null });
    const forbidden = await mockGetMemberDetail({
      employee: { ...authorized, permissions: ["member:write"] },
    });
    const crossStoreReadable = await mockGetMemberDetail({
      employee: authorized,
      memberStoreId: "store_2",
    });
    const crossStoreEditBlocked = await mockPatchMemberDetail({
      employee: { ...authorized, roleLevel: "manager" },
      memberStoreId: "store_2",
      body: { name: "李四" },
    });
    const invalid = await mockPatchMemberDetail({
      employee: authorized,
      body: { name: "" },
    });
    const blocked = await mockPatchMemberDetail({
      employee: authorized,
      body: { name: "李四", phone: "13800138000" },
      blacklistHit: true,
    });
    const updated = await mockPatchMemberDetail({
      employee: authorized,
      body: { name: "李四" },
      auditCreate,
    });

    expect(unauthenticated.status).toBe(401);
    await expect(unauthenticated.json()).resolves.toMatchObject({ code: 1001 });
    expect(forbidden.status).toBe(403);
    await expect(forbidden.json()).resolves.toMatchObject({ code: 1002 });
    expect(crossStoreReadable.status).toBe(200);
    await expect(crossStoreReadable.json()).resolves.toMatchObject({ code: 0, data: { storeId: "store_2" } });
    expect(crossStoreEditBlocked.status).toBe(403);
    await expect(crossStoreEditBlocked.json()).resolves.toMatchObject({ code: 1002, message: "P2只能编辑当前门店会员" });
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({ code: 1000 });
    expect(blocked.status).toBe(409);
    await expect(blocked.json()).resolves.toMatchObject({ code: 1005 });
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({
      code: 0,
      data: { name: "李四" },
    });
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "UPDATE",
        resourceType: "Member",
        requestId: "req_member_patch",
      }),
    );
  });
});

describe("POST /api/v1/followups contract", () => {
  it("covers permission, store isolation, zod validation, blacklist blocking, and audit write", async () => {
    const auditCreate = vi.fn();
    const unauthenticated = await mockPostFollowup({
      employee: null,
      body: { memberId: "member_1", content: "邀约到店沟通" },
    });
    const forbidden = await mockPostFollowup({
      employee: { ...authorized, permissions: ["member:read"] },
      body: { memberId: "member_1", content: "邀约到店沟通" },
    });
    const invalid = await mockPostFollowup({
      employee: authorized,
      body: { memberId: "member_1" },
    });
    const crossStore = await mockPostFollowup({
      employee: authorized,
      memberStoreId: "store_2",
      body: { memberId: "member_1", content: "邀约到店沟通" },
    });
    const blocked = await mockPostFollowup({
      employee: authorized,
      body: { memberId: "member_1", content: "邀约到店沟通" },
      blacklistHit: true,
    });
    const created = await mockPostFollowup({
      employee: authorized,
      body: { memberId: "member_1", content: "邀约到店沟通" },
      auditCreate,
    });

    expect(unauthenticated.status).toBe(401);
    await expect(unauthenticated.json()).resolves.toMatchObject({ code: 1001 });
    expect(forbidden.status).toBe(403);
    await expect(forbidden.json()).resolves.toMatchObject({ code: 1002 });
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({ code: 1000 });
    expect(crossStore.status).toBe(403);
    await expect(crossStore.json()).resolves.toMatchObject({ code: 1002 });
    expect(blocked.status).toBe(409);
    await expect(blocked.json()).resolves.toMatchObject({ code: 1005 });
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({
      code: 0,
      data: { id: "followup_1", contentSummary: "邀约到店沟通" },
    });
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CREATE",
        resourceType: "FollowUpRecord",
        requestId: "req_followup_create",
      }),
    );
  });
});

describe("GET/POST /api/v1/blacklists contract", () => {
  it("returns paginated sanitized blacklist entries with auth, permission, and store isolation", async () => {
    const unauthenticated = await mockGetBlacklists({ employee: null });
    const forbidden = await mockGetBlacklists({
      employee: { ...authorized, permissions: ["blacklist:write"] },
    });
    const crossStore = await mockGetBlacklists({
      employee: authorized,
      query: "?storeId=store_2",
    });
    const listed = await mockGetBlacklists({ employee: authorized });
    const body = await listed.json();

    expect(unauthenticated.status).toBe(401);
    await expect(unauthenticated.json()).resolves.toMatchObject({ code: 1001 });
    expect(forbidden.status).toBe(403);
    await expect(forbidden.json()).resolves.toMatchObject({ code: 1002 });
    expect(crossStore.status).toBe(403);
    await expect(crossStore.json()).resolves.toMatchObject({ code: 1002 });
    expect(listed.status).toBe(200);
    expect(body.data).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [{ phoneMasked: "138****8000", status: "ACTIVE" }],
    });
    expect(JSON.stringify(body.data)).not.toContain("13800138000");
    expect(JSON.stringify(body.data)).not.toContain("phoneHash");
  });

  it("creates blacklist entries with zod validation, store isolation, sanitization, and audit write", async () => {
    const auditCreate = vi.fn();
    const invalid = await mockPostBlacklist({
      employee: authorized,
      body: { storeId: "store_1", reason: "投诉欺诈" },
    });
    const crossStore = await mockPostBlacklist({
      employee: authorized,
      body: { storeId: "store_2", phone: "13800138000", reason: "投诉欺诈" },
    });
    const created = await mockPostBlacklist({
      employee: authorized,
      body: { storeId: "store_1", phone: "13800138000", reason: "投诉欺诈" },
      auditCreate,
    });
    const body = await created.json();

    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({ code: 1000 });
    expect(crossStore.status).toBe(403);
    await expect(crossStore.json()).resolves.toMatchObject({ code: 1002 });
    expect(created.status).toBe(201);
    expect(body).toMatchObject({
      code: 0,
      data: {
        id: "blacklist_1",
        phoneMasked: "138****8000",
      },
    });
    expect(JSON.stringify(body.data)).not.toContain("13800138000");
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CREATE",
        resourceType: "BlacklistEntry",
        requestId: "req_blacklist_create",
      }),
    );
  });
});

describe("GET /api/v1/audits contract", () => {
  it("covers auth, permission, store isolation, pagination, and sanitized before/after summaries", async () => {
    const unauthenticated = await mockGetAudits({ employee: null });
    const forbidden = await mockGetAudits({
      employee: { ...authorized, permissions: ["member:read"] },
    });
    const crossStore = await mockGetAudits({
      employee: authorized,
      query: "?storeId=store_2",
    });
    const listed = await mockGetAudits({ employee: authorized });
    const body = await listed.json();

    expect(unauthenticated.status).toBe(401);
    await expect(unauthenticated.json()).resolves.toMatchObject({ code: 1001 });
    expect(forbidden.status).toBe(403);
    await expect(forbidden.json()).resolves.toMatchObject({ code: 1002 });
    expect(crossStore.status).toBe(403);
    await expect(crossStore.json()).resolves.toMatchObject({ code: 1002 });
    expect(listed.status).toBe(200);
    expect(body.data).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          resourceType: "Member",
          requestId: "req_member_patch",
          metadataJson: {
            beforeSummary: { name: "张三" },
            afterSummary: { name: "李四" },
          },
        },
      ],
    });
    expect(JSON.stringify(body.data)).not.toContain("13800138000");
    expect(JSON.stringify(body.data)).not.toContain("password");
  });
});
