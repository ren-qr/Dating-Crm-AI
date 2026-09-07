import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentEmployee: vi.fn(),
  employeeFindUnique: vi.fn(),
  employeeFindFirst: vi.fn(),
  memberFindMany: vi.fn(),
  memberCount: vi.fn(),
  memberCreate: vi.fn(),
  memberFindFirst: vi.fn(),
  memberUpdate: vi.fn(),
  memberDocumentFindMany: vi.fn(),
  followUpFindMany: vi.fn(),
  blacklistFindMany: vi.fn(),
  auditFindMany: vi.fn(),
  auditCreate: vi.fn(),
  blacklistFindFirst: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/business-support/permissions/current-user", () => ({
  getCurrentEmployee: mocks.getCurrentEmployee,
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    employee: { findUnique: mocks.employeeFindUnique, findFirst: mocks.employeeFindFirst },
    member: {
      findMany: mocks.memberFindMany,
      findFirst: mocks.memberFindFirst,
      count: mocks.memberCount,
      create: mocks.memberCreate,
      update: mocks.memberUpdate,
    },
    memberDocument: { findMany: mocks.memberDocumentFindMany },
    followUpRecord: { findMany: mocks.followUpFindMany },
    blacklistEntry: { findFirst: mocks.blacklistFindFirst, findMany: mocks.blacklistFindMany },
    auditLog: { create: mocks.auditCreate, findMany: mocks.auditFindMany },
    $transaction: mocks.transaction,
  },
}));

const listRoute = await import("@/app/api/v1/members/route");
const detailRoute = await import("@/app/api/v1/members/[id]/route");

const employee = {
  employeeId: "emp_1",
  storeId: "store_1",
  email: "staff@example.com",
  name: "顾问",
  roleCodes: ["consultant"],
  roleLevel: "staff" as const,
  roleName: "员工",
  permissions: ["member:read", "member:write", "profile:read", "profile:write"],
};

const createdAt = new Date("2026-09-07T01:00:00.000Z");
const member = {
  id: "member_1",
  storeId: "store_1",
  ownerEmployeeId: "emp_1",
  memberNo: "M202609070001",
  name: "林若妍",
  gender: "FEMALE",
  birthDate: "1994-02-03",
  status: "ACTIVE",
  heightCm: 165,
  weightKg: null,
  education: "本科",
  occupation: "设计师",
  incomeRange: null,
  maritalStatus: "未婚",
  housingStatus: null,
  vehicleStatus: null,
  hometownProvince: "浙江省",
  hometownCity: "杭州市",
  hometownDistrict: "西湖区",
  currentProvince: "上海市",
  currentCity: "上海市",
  currentDistrict: "徐汇区",
  profileCompletenessPercent: 70,
  createdById: "emp_1",
  updatedById: null,
  createdAt,
  updatedAt: createdAt,
  owner: { name: "顾问" },
  sensitiveInfo: { storeId: "store_1", phoneEncrypted: "mvp:v1:MTM4MDAxMzgwMDA", phoneHash: "hash", idCardEncrypted: null, idCardHash: null },
  matePreference: null,
  extraProfile: { storeId: "store_1", hobbies: "阅读", selfDescription: "喜欢旅行" },
};

function setStoreScope() {
  mocks.employeeFindUnique.mockResolvedValue({ storeId: "store_1" });
}

afterEach(() => vi.clearAllMocks());

describe("Member API follows Schema V3.1", () => {
  it("requires a logged-in member reader", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(null);
    const response = await listRoute.GET(new Request("https://example.test/api/v1/members"));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: 1001, data: null });

    mocks.getCurrentEmployee.mockResolvedValue({ ...employee, permissions: ["member:write"] });
    const forbidden = await listRoute.GET(new Request("https://example.test/api/v1/members"));
    expect(forbidden.status).toBe(403);
    await expect(forbidden.json()).resolves.toMatchObject({ code: 1002, data: null });
  });

  it("lists only the authenticated employee's records in the resolved store", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(employee);
    setStoreScope();
    mocks.memberFindMany.mockResolvedValue([member]);
    mocks.memberCount.mockResolvedValue(1);

    const response = await listRoute.GET(new Request("https://example.test/api/v1/members?keyword=%E8%AE%BE%E8%AE%A1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.memberFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: "store_1", ownerEmployeeId: "emp_1" }),
      include: expect.objectContaining({ sensitiveInfo: true, matePreference: true, extraProfile: true }),
    }));
    expect(body.data.items[0]).toMatchObject({
      id: "member_1",
      name: "林若妍",
      phoneMasked: "138****8000",
      currentCity: "上海市-上海市-徐汇区",
      profile: { hobbies: "阅读", selfDescription: "喜欢旅行" },
    });
    expect(body.data.items[0]).not.toHaveProperty("source");
    expect(body.data.items[0]).not.toHaveProperty("familyBackground");
  });

  it("does not expand the row scope from client query parameters", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(employee);
    setStoreScope();
    mocks.memberFindMany.mockResolvedValue([]);
    mocks.memberCount.mockResolvedValue(0);

    const response = await listRoute.GET(new Request("https://example.test/api/v1/members?storeId=store_2&ownerId=emp_2"));

    expect(response.status).toBe(200);
    expect(mocks.memberFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId: "store_1", ownerEmployeeId: "emp_1" },
    }));
  });

  it("rejects malformed birth dates before writing", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(employee);
    const response = await listRoute.POST(new Request("https://example.test/api/v1/members", {
      method: "POST",
      body: JSON.stringify({ name: "林若妍", birthDate: "2026-99-99" }),
    }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 1000, message: "参数错误：birthDate 无效" });
    expect(mocks.memberCreate).not.toHaveBeenCalled();
  });

  it("creates V3.1 member extensions instead of retired Member fields", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(employee);
    setStoreScope();
    mocks.employeeFindFirst.mockResolvedValue({ id: "emp_1" });
    mocks.blacklistFindFirst.mockResolvedValue(null);
    mocks.memberCreate.mockResolvedValue(member);
    mocks.auditCreate.mockResolvedValue({ id: "audit_1" });
    mocks.transaction.mockImplementation(async (callback) => callback({
      member: { create: mocks.memberCreate },
      auditLog: { create: mocks.auditCreate },
    }));

    const response = await listRoute.POST(new Request("https://example.test/api/v1/members", {
      method: "POST",
      body: JSON.stringify({
        name: "林若妍",
        phone: "13800138000",
        birthDate: "1994-02-03T00:00:00.000Z",
        gender: "FEMALE",
        hobbies: "阅读",
        selfDescription: "喜欢旅行",
      }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.memberCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        birthDate: "1994-02-03",
        sensitiveInfo: { create: expect.objectContaining({ storeId: "store_1", phoneEncrypted: expect.stringMatching(/^aes-256-gcm:v1:/) }) },
        extraProfile: { create: { storeId: "store_1", hobbies: "阅读", selfDescription: "喜欢旅行" } },
      }),
    }));
    const createData = mocks.memberCreate.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(createData).not.toHaveProperty("phoneEncrypted");
    expect(createData).not.toHaveProperty("source");
  });

  it("reads the detail through the same store and owner boundary", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(employee);
    setStoreScope();
    mocks.memberFindFirst.mockResolvedValue(member);
    mocks.memberDocumentFindMany.mockResolvedValue([]);
    mocks.followUpFindMany.mockResolvedValue([]);
    mocks.blacklistFindMany.mockResolvedValue([]);
    mocks.auditFindMany.mockResolvedValue([]);

    const response = await detailRoute.GET(new Request("https://example.test/api/v1/members/member_1"), { params: Promise.resolve({ id: "member_1" }) });

    expect(response.status).toBe(200);
    expect(mocks.memberFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "member_1", storeId: "store_1", ownerEmployeeId: "emp_1" },
    }));
  });
});
