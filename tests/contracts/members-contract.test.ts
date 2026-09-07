import { describe, expect, it } from "vitest";

import { ApiCode, apiResponse, apiSuccess } from "@/lib/server/api-response";

type MemberListItem = {
  id: string;
  memberNo: string;
  name: string;
  phoneMasked: string | null;
  gender: "MALE" | "FEMALE" | "OTHER" | "UNKNOWN";
  status: string;
  storeId: string;
  ownerEmployeeId: string;
  profileCompletenessPercent: number;
  createdAt: string;
  updatedAt: string;
};

const memberFixture: MemberListItem = {
  id: "mem_001",
  memberNo: "M202607110001",
  name: "林若妍",
  phoneMasked: "138****6210",
  gender: "FEMALE",
  status: "ACTIVE",
  storeId: "store_jingan",
  ownerEmployeeId: "emp_consultant_1",
  profileCompletenessPercent: 72,
  createdAt: "2026-07-11T01:00:00.000Z",
  updatedAt: "2026-07-11T02:00:00.000Z",
};

function request(path: string, requestId: string, init?: RequestInit) {
  return new Request(`https://example.test${path}`, {
    ...init,
    headers: {
      "x-request-id": requestId,
      ...(init?.headers ?? {}),
    },
  });
}

function hasPermission(permissions: string[] | undefined, required: string) {
  return Boolean(permissions?.includes(required));
}

async function mockGetMembersRoute(options: {
  permissions?: string[];
  query?: string;
  items?: MemberListItem[];
  total?: number;
}) {
  const req = request(
    `/api/v1/members${options.query ?? ""}`,
    "req_members_get_contract",
  );

  if (!options.permissions) {
    return apiResponse(req, {
      code: ApiCode.UNAUTHENTICATED,
      message: "未认证",
      data: null,
      status: 401,
    });
  }

  if (!hasPermission(options.permissions, "member:read")) {
    return apiResponse(req, {
      code: ApiCode.FORBIDDEN,
      message: "无权限",
      data: null,
      status: 403,
    });
  }

  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "20");

  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    return apiResponse(req, {
      code: ApiCode.BAD_REQUEST,
      message: "参数错误",
      data: null,
      status: 400,
    });
  }

  const items = options.items ?? [memberFixture];
  const total = options.total ?? items.length;

  return apiSuccess(req, {
    items,
    page,
    pageSize,
    total,
    hasNext: page * pageSize < total,
  });
}

async function mockPostMembersRoute(options: {
  permissions?: string[];
  body?: Record<string, unknown>;
}) {
  const req = request(" /api/v1/members".trim(), "req_members_post_contract", {
    method: "POST",
    body: JSON.stringify(options.body ?? {}),
  });

  if (!options.permissions) {
    return apiResponse(req, {
      code: ApiCode.UNAUTHENTICATED,
      message: "未认证",
      data: null,
      status: 401,
    });
  }

  if (!hasPermission(options.permissions, "member:write")) {
    return apiResponse(req, {
      code: ApiCode.FORBIDDEN,
      message: "无权限",
      data: null,
      status: 403,
    });
  }

  const body = (await req.json()) as {
    storeId?: string;
    name?: string;
    phone?: string;
    gender?: string;
  };

  if (!body.storeId || !body.name || body.name.length > 80) {
    return apiResponse(req, {
      code: ApiCode.BAD_REQUEST,
      message: "参数错误",
      data: null,
      status: 400,
    });
  }

  return apiSuccess(req, {
    ...memberFixture,
    id: "mem_created",
    name: body.name,
    phoneMasked: body.phone ? `${body.phone.slice(0, 3)}****${body.phone.slice(-4)}` : null,
    gender: body.gender ?? "UNKNOWN",
    storeId: body.storeId,
  });
}

describe("GET /api/v1/members contract", () => {
  it("returns unified response and pagination fields for authorized readers", async () => {
    const response = await mockGetMembersRoute({
      permissions: ["member:read"],
      query: "?page=2&pageSize=20",
      total: 45,
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      code: 0,
      message: "success",
      requestId: "req_members_get_contract",
      data: {
        page: 2,
        pageSize: 20,
        total: 45,
        hasNext: true,
      },
    });
    expect(Date.parse(body.timestamp)).not.toBeNaN();
    expect(body.data.items[0]).toEqual(memberFixture);
  });

  it("rejects missing auth and missing member:read permission", async () => {
    const unauthenticated = await mockGetMembersRoute({});
    const forbidden = await mockGetMembersRoute({ permissions: ["member:write"] });

    await expect(unauthenticated.json()).resolves.toMatchObject({
      code: 1001,
      data: null,
    });
    expect(unauthenticated.status).toBe(401);

    await expect(forbidden.json()).resolves.toMatchObject({
      code: 1002,
      data: null,
    });
    expect(forbidden.status).toBe(403);
  });

  it("rejects invalid pagination parameters", async () => {
    const response = await mockGetMembersRoute({
      permissions: ["member:read"],
      query: "?page=0&pageSize=101",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 1000,
      message: "参数错误",
      data: null,
    });
  });

  it("does not expose raw sensitive fields in list items", async () => {
    const response = await mockGetMembersRoute({ permissions: ["member:read"] });
    const body = await response.json();
    const serialized = JSON.stringify(body.data.items[0]);

    expect(body.data.items[0]).toHaveProperty("phoneMasked", "138****6210");
    expect(body.data.items[0]).not.toHaveProperty("phone");
    expect(body.data.items[0]).not.toHaveProperty("phoneHash");
    expect(body.data.items[0]).not.toHaveProperty("nameEncrypted");
    expect(serialized).not.toContain("13812346210");
  });
});

describe("POST /api/v1/members contract", () => {
  it("creates a sanitized member item for authorized writers", async () => {
    const response = await mockPostMembersRoute({
      permissions: ["member:write"],
      body: {
        storeId: "store_jingan",
        name: "林若妍",
        phone: "13812346210",
        gender: "FEMALE",
      },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      code: 0,
      requestId: "req_members_post_contract",
      data: {
        id: "mem_created",
        name: "林若妍",
        phoneMasked: "138****6210",
        storeId: "store_jingan",
      },
    });
    expect(JSON.stringify(body.data)).not.toContain("13812346210");
  });

  it("rejects missing auth, missing member:write, and invalid body", async () => {
    const unauthenticated = await mockPostMembersRoute({
      body: { storeId: "store_jingan", name: "林若妍" },
    });
    const forbidden = await mockPostMembersRoute({
      permissions: ["member:read"],
      body: { storeId: "store_jingan", name: "林若妍" },
    });
    const invalid = await mockPostMembersRoute({
      permissions: ["member:write"],
      body: { storeId: "store_jingan", name: "" },
    });

    expect(unauthenticated.status).toBe(401);
    await expect(unauthenticated.json()).resolves.toMatchObject({ code: 1001 });

    expect(forbidden.status).toBe(403);
    await expect(forbidden.json()).resolves.toMatchObject({ code: 1002 });

    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({
      code: 1000,
      message: "参数错误",
      data: null,
    });
  });
});
