import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentEmployee: vi.fn(),
  employeeFindUnique: vi.fn(),
  employeeFindFirst: vi.fn(),
  memberFindMany: vi.fn(),
  memberFindFirst: vi.fn(),
  memberCount: vi.fn(),
  memberCreate: vi.fn(),
  memberUpdate: vi.fn(),
  memberDelete: vi.fn(),
  blacklistEntryFindFirst: vi.fn(),
  auditLogFindMany: vi.fn(),
  auditLogCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/business-support/permissions/current-user", () => ({
  getCurrentEmployee: mocks.getCurrentEmployee,
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    employee: {
      findUnique: mocks.employeeFindUnique,
      findFirst: mocks.employeeFindFirst,
    },
    member: {
      findMany: mocks.memberFindMany,
      findFirst: mocks.memberFindFirst,
      count: mocks.memberCount,
      create: mocks.memberCreate,
      update: mocks.memberUpdate,
      delete: mocks.memberDelete,
    },
    blacklistEntry: {
      findFirst: mocks.blacklistEntryFindFirst,
    },
    auditLog: {
      findMany: mocks.auditLogFindMany,
      create: mocks.auditLogCreate,
    },
    $transaction: mocks.transaction,
  },
}));

const { GET, POST } = await import("@/app/api/v1/members/route");
const memberDetailRoute = await import("@/app/api/v1/members/[id]/route");

const activeEmployee = {
  employeeId: "emp_1",
  email: "staff@example.com",
  name: "Staff",
  roleCodes: ["consultant"],
  roleLevel: "staff",
  roleName: "员工",
  permissions: ["member:read", "member:write"],
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/members", () => {
  it("returns 1001 when unauthenticated", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(null);

    const response = await GET(
      new Request("https://example.test/api/v1/members", {
        headers: { "x-request-id": "req_members_unauthenticated" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      code: 1001,
      message: "未认证",
      data: null,
      requestId: "req_members_unauthenticated",
    });
  });

  it("returns 1002 without member read permission", async () => {
    mocks.getCurrentEmployee.mockResolvedValue({
      ...activeEmployee,
      permissions: ["member:write"],
    });

    const response = await GET(new Request("https://example.test/api/v1/members"));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      code: 1002,
      message: "无权限",
      data: null,
    });
  });

  it("allows staff to list another store's members while keeping identity policy separate", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(activeEmployee);
    mocks.memberFindMany.mockResolvedValue([]);
    mocks.memberCount.mockResolvedValue(0);
    mocks.transaction.mockImplementation(async (operations) => Promise.all(operations));

    const response = await GET(
      new Request("https://example.test/api/v1/members?storeId=store_2"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items).toEqual([]);
    expect(mocks.memberFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [{}, { storeId: "store_2" }] },
    }));
  });

  it("allows staff to read the unfiltered member directory", async () => {
    const createdAt = new Date("2026-07-11T01:00:00.000Z");
    mocks.getCurrentEmployee.mockResolvedValue(activeEmployee);
    mocks.memberFindMany.mockResolvedValue([{ 
      id: "member_1", storeId: "store_1", ownerEmployeeId: "emp_1", owner: { name: "顾问" },
      memberNo: "MSTORE1001", name: "张三", phoneEncrypted: "mvp:v1:MTM4MDAxMzgwMDA",
      gender: "UNKNOWN", status: "LEAD", source: null, createdAt, updatedAt: createdAt,
    }]);
    mocks.memberCount.mockResolvedValue(1);
    mocks.transaction.mockImplementation(async (operations) => Promise.all(operations));

    const response = await GET(new Request("https://example.test/api/v1/members"));

    expect(response.status).toBe(200);
    expect(mocks.memberFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [{}] },
    }));
  });

  it("combines staff owner filters with the shared member read scope", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(activeEmployee);
    mocks.memberFindMany.mockResolvedValue([]);
    mocks.memberCount.mockResolvedValue(0);
    mocks.transaction.mockImplementation(async (operations) => Promise.all(operations));

    const response = await GET(new Request("https://example.test/api/v1/members?ownerId=emp_2"));

    expect(response.status).toBe(200);
    expect(mocks.memberFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        AND: [
          {},
          { ownerEmployeeId: "emp_2" },
        ],
      },
    }));
  });

  it("returns identity originals to managers", async () => {
    const createdAt = new Date("2026-07-11T01:00:00.000Z");
    mocks.getCurrentEmployee.mockResolvedValue({
      ...activeEmployee,
      roleCodes: ["store_manager"],
      roleLevel: "manager",
      roleName: "管理员",
      storeId: "store_1",
    });
    mocks.employeeFindUnique.mockResolvedValue({ storeId: "store_1" });
    mocks.memberFindMany.mockResolvedValue([{ 
      id: "member_store_1", storeId: "store_1", ownerEmployeeId: "emp_2", owner: { name: "李顾问" },
      memberNo: "MSTORE1002", name: "张三", phoneEncrypted: "mvp:v1:MTM4MDAxMzgwMDA", idCardEncrypted: "mvp:v1:MzEwMTAxMTk5MDAxMDE=",
      gender: "UNKNOWN", status: "LEAD", source: null, createdAt, updatedAt: createdAt, profile: null,
    }]);
    mocks.memberCount.mockResolvedValue(1);
    mocks.transaction.mockImplementation(async (operations) => Promise.all(operations));

    const response = await GET(new Request("https://example.test/api/v1/members?storeId=store_1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items[0]).toMatchObject({
      phone: "13800138000",
      idCard: "31010119900101",
      canEditIdentity: true,
    });
  });

  it("returns identity originals to managers across stores", async () => {
    const createdAt = new Date("2026-07-11T01:00:00.000Z");
    mocks.getCurrentEmployee.mockResolvedValue({
      ...activeEmployee,
      roleCodes: ["admin"],
      roleLevel: "manager",
      roleName: "管理员",
    });
    mocks.memberFindMany.mockResolvedValue([{ 
      id: "member_store_2", storeId: "store_2", ownerEmployeeId: "emp_2", owner: { name: "李顾问" },
      memberNo: "MSTORE2001", name: "张三", phoneEncrypted: "mvp:v1:MTM4MDAxMzgwMDA", idCardEncrypted: "mvp:v1:MzEwMTAxMTk5MDAxMDE=",
      gender: "UNKNOWN", status: "LEAD", source: null, createdAt, updatedAt: createdAt, profile: null,
    }]);
    mocks.memberCount.mockResolvedValue(1);
    mocks.transaction.mockImplementation(async (operations) => Promise.all(operations));

    const response = await GET(new Request("https://example.test/api/v1/members?storeId=store_2"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items[0]).toMatchObject({
      phone: "13800138000",
      idCard: "31010119900101",
      canEditIdentity: true,
    });
  });

  it("returns 1000 for invalid zod query parameters", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(activeEmployee);

    const response = await GET(
      new Request("https://example.test/api/v1/members?page=0&pageSize=101"),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      code: 1000,
      message: "参数错误",
      data: null,
    });
    expect(mocks.employeeFindUnique).not.toHaveBeenCalled();
    expect(mocks.memberFindMany).not.toHaveBeenCalled();
  });

  it("returns paginated members with optional store and owner filters", async () => {
    const createdAt = new Date("2026-07-11T01:00:00.000Z");
    const updatedAt = new Date("2026-07-11T02:00:00.000Z");

    mocks.getCurrentEmployee.mockResolvedValue(activeEmployee);
    mocks.employeeFindUnique.mockResolvedValue({ storeId: "store_1" });
    mocks.memberFindMany.mockResolvedValue([
      {
        id: "member_1",
        storeId: "store_1",
        ownerEmployeeId: "emp_1",
        owner: { name: "王顾问" },
        memberNo: "MSTORE1001",
        name: "张三",
        phoneEncrypted: "mvp:v1:MTM4MDAxMzgwMDA",
        gender: "FEMALE",
        status: "LEAD",
        source: "walk-in",
        createdAt,
        updatedAt,
        profileCompletenessPercent: 43,
      },
    ]);
    mocks.memberCount.mockResolvedValue(1);
    mocks.transaction.mockImplementation(async (operations) =>
      Promise.all(operations),
    );

    const response = await GET(
      new Request(
        "https://example.test/api/v1/members?page=1&pageSize=20&storeId=store_1&ownerId=emp_1&status=LEAD&sortBy=updatedAt&sortOrder=asc",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.employeeFindUnique).not.toHaveBeenCalled();
    expect(mocks.memberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {},
            { storeId: "store_1" },
            { status: "LEAD" },
            { ownerEmployeeId: "emp_1" },
          ],
        },
        orderBy: { updatedAt: "asc" },
        skip: 0,
        take: 20,
      }),
    );
    expect(body.data).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 1,
      hasNext: false,
      items: [
        {
          id: "member_1",
          name: "张三",
          ownerName: "王顾问",
          phoneMasked: "138****8000",
          phone: "13800138000",
          canEditIdentity: true,
          profileCompletenessPercent: 43,
        },
      ],
    });
  });

  it("keeps name, phone, and member number filters independent", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(activeEmployee);
    mocks.memberFindMany.mockResolvedValue([]);
    mocks.memberCount.mockResolvedValue(0);
    mocks.transaction.mockImplementation(async (operations) =>
      Promise.all(operations),
    );

    const response = await GET(
      new Request("https://example.test/api/v1/members?name=%E5%BC%A0&phone=13800138000&memberNo=M20260712"),
    );

    expect(response.status).toBe(200);
    expect(mocks.memberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {},
            { name: { contains: "张", mode: "insensitive" } },
            { memberNo: { contains: "M20260712", mode: "insensitive" } },
            { phoneHash: expect.any(String) },
          ]),
        }),
      }),
    );
  });
});

describe("POST /api/v1/members", () => {
  it("returns 1001 when unauthenticated", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(null);

    const response = await POST(
      new Request("https://example.test/api/v1/members", {
        method: "POST",
        body: JSON.stringify({
          storeId: "store_1",
          name: "张三",
          phone: "13800138000",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      code: 1001,
      message: "未认证",
      data: null,
    });
    expect(mocks.memberCreate).not.toHaveBeenCalled();
  });

  it("returns 1002 without member write permission", async () => {
    mocks.getCurrentEmployee.mockResolvedValue({
      ...activeEmployee,
      permissions: ["member:read"],
    });

    const response = await POST(
      new Request("https://example.test/api/v1/members", {
        method: "POST",
        body: JSON.stringify({
          storeId: "store_1",
          name: "张三",
          phone: "13800138000",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      code: 1002,
      message: "无权限",
      data: null,
    });
    expect(mocks.memberCreate).not.toHaveBeenCalled();
  });

  it("returns 1000 for invalid zod body without writing audit logs", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(activeEmployee);

    const response = await POST(
      new Request("https://example.test/api/v1/members", {
        method: "POST",
        body: JSON.stringify({
          storeId: "store_1",
          name: "",
          phone: "13800138000",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      code: 1000,
      message: "参数错误",
      data: null,
    });
    expect(mocks.memberCreate).not.toHaveBeenCalled();
    expect(mocks.auditLogCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["手机号不是中国大陆 11 位数字", { name: "张三", phone: "12800138000" }],
    ["手机号包含分隔符", { name: "张三", phone: "138-0013-8000" }],
    ["姓名过短", { name: "张" }],
    ["姓名包含数字", { name: "张三2" }],
    ["出生日期无效", { name: "张三", birthDate: "2026-02-30" }],
    ["出生日期不在 18 至 80 岁范围", { name: "张三", birthDate: "2015-01-01" }],
    ["身高超出范围", { name: "张三", heightCm: 231 }],
    ["学历不在 V1 枚举内", { name: "张三", education: "研究生" }],
    ["婚况不在 V1 枚举内", { name: "张三", maritalStatus: "保密" }],
    ["来源过短", { name: "张三", source: "A" }],
  ])("rejects %s without database writes", async (_label, body) => {
    mocks.getCurrentEmployee.mockResolvedValue(activeEmployee);

    const response = await POST(
      new Request("https://example.test/api/v1/members", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
    const responseBody = await response.json();

    expect(response.status).toBe(400);
    expect(responseBody).toMatchObject({
      code: 1000,
      message: "参数错误",
      data: null,
    });
    expect(JSON.stringify(responseBody)).not.toContain("138-0013-8000");
    expect(mocks.employeeFindUnique).not.toHaveBeenCalled();
    expect(mocks.memberCreate).not.toHaveBeenCalled();
    expect(mocks.auditLogCreate).not.toHaveBeenCalled();
  });

  it("accepts the V1 profile field formats", async () => {
    const createdAt = new Date("2026-07-11T03:00:00.000Z");

    mocks.getCurrentEmployee.mockResolvedValue(activeEmployee);
    mocks.employeeFindUnique.mockResolvedValue({ storeId: "store_1" });
    mocks.employeeFindFirst.mockResolvedValue({ id: "emp_1" });
    mocks.blacklistEntryFindFirst.mockResolvedValue(null);
    mocks.memberCreate.mockResolvedValue({
      id: "member_v1_valid",
      storeId: "store_1",
      ownerEmployeeId: "emp_1",
      owner: { name: "王顾问" },
      memberNo: "MSTORE1002",
      name: "张三",
      phoneEncrypted: "mvp:v1:MTM4MDAxMzgwMDA",
      gender: "FEMALE",
      status: "LEAD",
      source: "门店到访",
      createdAt,
      updatedAt: createdAt,
      profile: { profileCompletenessPercent: 86 },
    });
    mocks.auditLogCreate.mockResolvedValue({ id: "audit_v1_valid" });
    mocks.transaction.mockImplementation(async (callback) => callback({
      member: { create: mocks.memberCreate },
      auditLog: { create: mocks.auditLogCreate },
    }));

    const response = await POST(
      new Request("https://example.test/api/v1/members", {
        method: "POST",
        body: JSON.stringify({
          name: "张三",
          phone: "13800138000",
          birthDate: "1995-01-01T00:00:00.000Z",
          source: "门店到访",
          education: "本科",
          heightCm: 168,
          maritalStatus: "未婚",
          housingStatus: "自有住房",
          vehicleStatus: "有车",
          familyBackground: "家庭关系稳定",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.memberCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        housingStatus: "自有住房",
        vehicleStatus: "有车",
        familyBackground: "家庭关系稳定",
      }),
    }));
  });

  it("allows staff to create a member in another store", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(activeEmployee);
    mocks.employeeFindUnique.mockResolvedValue({ storeId: "store_1" });

    const response = await POST(
      new Request("https://example.test/api/v1/members", {
        method: "POST",
        body: JSON.stringify({
          storeId: "store_2",
          name: "张三",
          phone: "13800138000",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.code).toBe(0);
    expect(mocks.memberCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ storeId: "store_2" }),
    }));
  });

  it("allows staff to create a member for another employee", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(activeEmployee);
    mocks.employeeFindUnique.mockResolvedValue({ storeId: "store_1" });

    const response = await POST(
      new Request("https://example.test/api/v1/members", {
        method: "POST",
        body: JSON.stringify({
          storeId: "store_1",
          ownerEmployeeId: "emp_2",
          name: "张三",
          phone: "13800138000",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.code).toBe(0);
    expect(mocks.memberCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ ownerEmployeeId: "emp_2" }),
    }));
  });

  it("allows manager to create a member for another same-store employee", async () => {
    const createdAt = new Date("2026-07-11T03:00:00.000Z");

    mocks.getCurrentEmployee.mockResolvedValue({
      ...activeEmployee,
      roleCodes: ["store_manager"],
      roleLevel: "manager",
      roleName: "P2",
    });
    mocks.employeeFindUnique.mockResolvedValue({ storeId: "store_1" });
    mocks.employeeFindFirst.mockResolvedValue({ id: "emp_2" });
    mocks.blacklistEntryFindFirst.mockResolvedValue(null);
    mocks.memberCreate.mockResolvedValue({
      id: "member_manager_assign",
      storeId: "store_1",
      ownerEmployeeId: "emp_2",
      owner: { name: "王顾问" },
      memberNo: "MSTORE1003",
      name: "张三",
      phoneEncrypted: "mvp:v1:MTM4MDAxMzgwMDA",
      gender: "FEMALE",
      status: "LEAD",
      source: null,
      createdAt,
      updatedAt: createdAt,
      profile: { profileCompletenessPercent: 43 },
    });
    mocks.auditLogCreate.mockResolvedValue({ id: "audit_manager_assign" });
    mocks.transaction.mockImplementation(async (callback) => callback({
      member: { create: mocks.memberCreate },
      auditLog: { create: mocks.auditLogCreate },
    }));

    const response = await POST(
      new Request("https://example.test/api/v1/members", {
        method: "POST",
        body: JSON.stringify({
          storeId: "store_1",
          ownerEmployeeId: "emp_2",
          name: "张三",
          phone: "13800138000",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.employeeFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "emp_2", storeId: "store_1", status: "ACTIVE" },
    }));
    expect(mocks.memberCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ ownerEmployeeId: "emp_2" }),
    }));
  });

  it("returns 1005 and writes audit log when member creation hits blacklist", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(activeEmployee);
    mocks.employeeFindUnique.mockResolvedValue({ storeId: "store_1" });
    mocks.employeeFindFirst.mockResolvedValue({ id: "emp_1" });
    mocks.blacklistEntryFindFirst.mockResolvedValue({
      id: "blacklist_1",
      reason: "投诉欺诈",
      severity: "HIGH",
      status: "ACTIVE",
      memberId: null,
      expiresAt: null,
    });
    mocks.auditLogCreate.mockResolvedValue({ id: "audit_blacklist" });

    const response = await POST(
      new Request("https://example.test/api/v1/members", {
        method: "POST",
        headers: { "x-request-id": "req_create_member_blocked" },
        body: JSON.stringify({
          storeId: "store_1",
          name: "张三",
          phone: "13800138000",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      code: 1005,
      message: "黑名单拦截",
      data: {
        blacklistEntryId: "blacklist_1",
        severity: "HIGH",
      },
      requestId: "req_create_member_blocked",
    });
    expect(mocks.memberCreate).not.toHaveBeenCalled();
    expect(mocks.auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "BLACKLIST_BLOCK",
          resourceType: "Member",
          resourceId: null,
          requestId: "req_create_member_blocked",
          metadataJson: expect.objectContaining({
            entryId: "blacklist_1",
            operation: "member.create",
          }),
        }),
      }),
    );
  });

  it("returns a newly created member's contact only to its assigned consultant", async () => {
    const createdAt = new Date("2026-07-11T03:00:00.000Z");
    const updatedAt = new Date("2026-07-11T03:00:00.000Z");

    mocks.getCurrentEmployee.mockResolvedValue(activeEmployee);
    mocks.employeeFindUnique.mockResolvedValue({ storeId: "store_1" });
    mocks.employeeFindFirst.mockResolvedValue({ id: "emp_1" });
    mocks.blacklistEntryFindFirst.mockResolvedValue(null);
    mocks.memberCreate.mockResolvedValue({
      id: "member_1",
      storeId: "store_1",
      ownerEmployeeId: "emp_1",
      owner: { name: "王顾问" },
      memberNo: "MSTORE1001",
      name: "张三",
      phoneEncrypted: "mvp:v1:MTM4MDAxMzgwMDA",
      phoneHash: "hash",
      gender: "FEMALE",
      status: "LEAD",
      source: "walk-in",
      createdAt,
      updatedAt,
      profile: { profileCompletenessPercent: 86 },
    });
    mocks.auditLogCreate.mockResolvedValue({ id: "audit_1" });
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        member: { create: mocks.memberCreate },
        auditLog: { create: mocks.auditLogCreate },
      }),
    );

    const response = await POST(
      new Request("https://example.test/api/v1/members", {
        method: "POST",
        headers: { "x-request-id": "req_create_member" },
        body: JSON.stringify({
          storeId: "store_1",
          name: "张三",
          phone: "13800138000",
          email: "zhangsan@example.com",
          gender: "FEMALE",
          birthDate: "1995-01-01T00:00:00.000Z",
          source: "walk-in",
          education: "本科",
          heightCm: 168,
          maritalStatus: "未婚",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.memberCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storeId: "store_1",
          ownerEmployeeId: "emp_1",
          name: "张三",
          phoneEncrypted: expect.stringMatching(/^aes-256-gcm:v1:/),
          phoneHash: expect.any(String),
          education: "本科",
          heightCm: 168,
          maritalStatus: "未婚",
        }),
      }),
    );
    expect(mocks.auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CREATE",
          resourceType: "Member",
          resourceId: "member_1",
          requestId: "req_create_member",
          metadataJson: expect.objectContaining({
            hasPhone: true,
            hasEmail: true,
          }),
        }),
      }),
    );
    expect(body).toMatchObject({
      code: 0,
      message: "创建成功",
      data: {
        id: "member_1",
        name: "张三",
        phoneMasked: "138****8000",
        emailMasked: "zh***@example.com",
      },
      requestId: "req_create_member",
    });
    expect(body.data.phone).toBe("13800138000");
    expect(body.data.canEditIdentity).toBe(true);
  });
});

describe("GET /api/v1/members/{id}", () => {
  it("lets logged-in employees read member details across stores", async () => {
    const createdAt = new Date("2026-07-11T01:00:00.000Z");

    mocks.getCurrentEmployee.mockResolvedValue({
      ...activeEmployee,
      permissions: ["member:read", "profile:read"],
    });
    mocks.memberFindFirst.mockResolvedValue({
      id: "member_store_2",
      storeId: "store_2",
      ownerEmployeeId: "emp_2",
      owner: { name: "李顾问" },
      memberNo: "MSTORE2001",
      name: "张三",
      phoneEncrypted: null,
      gender: "UNKNOWN",
      status: "LEAD",
      source: null,
      blacklistedAt: null,
      createdAt,
      updatedAt: createdAt,
      profile: null,
      documents: [],
      followUps: [],
      blacklistEntries: [],
    });
    mocks.auditLogFindMany.mockResolvedValue([]);

    const response = await memberDetailRoute.GET(
      new Request("https://example.test/api/v1/members/member_store_2"),
      { params: Promise.resolve({ id: "member_store_2" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.memberFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "member_store_2" },
      }),
    );
    expect(mocks.employeeFindUnique).not.toHaveBeenCalled();
    expect(body.data).toMatchObject({
      id: "member_store_2",
      storeId: "store_2",
      ownerEmployeeId: "emp_2",
    });
  });
});

describe("PATCH /api/v1/members/{id}", () => {
  const currentMember = {
    id: "member_1",
    storeId: "store_1",
    ownerEmployeeId: "emp_1",
    owner: { name: "王顾问" },
    memberNo: "MSTORE1001",
    name: "张三",
    phoneEncrypted: null,
    birthDate: null,
    gender: "UNKNOWN",
    status: "LEAD",
    source: null,
    blacklistedAt: null,
    createdAt: new Date("2026-07-11T01:00:00.000Z"),
    updatedAt: new Date("2026-07-11T01:00:00.000Z"),
    profile: null,
    documents: [],
    followUps: [],
    blacklistEntries: [],
  };

  it("allows managers to edit members from any store", async () => {
    mocks.getCurrentEmployee.mockResolvedValue({
      ...activeEmployee,
      employeeId: "emp_owner",
      roleCodes: ["admin"],
      roleLevel: "manager",
      roleName: "管理员",
      permissions: ["member:write", "profile:write"],
    });
    mocks.memberFindFirst.mockResolvedValue({ ...currentMember, storeId: "store_2", ownerEmployeeId: "emp_2" });
    mocks.blacklistEntryFindFirst.mockResolvedValue(null);
    mocks.memberUpdate.mockResolvedValue({ ...currentMember, storeId: "store_2", ownerEmployeeId: "emp_2", status: "ACTIVE" });
    mocks.auditLogCreate.mockResolvedValue({ id: "audit_patch_owner" });
    mocks.transaction.mockImplementation(async (callback) => callback({
      member: { update: mocks.memberUpdate },
      auditLog: { create: mocks.auditLogCreate },
    }));

    const response = await memberDetailRoute.PATCH(
      new Request("https://example.test/api/v1/members/member_1", {
        method: "PATCH",
        body: JSON.stringify({ status: "ACTIVE" }),
      }),
      { params: Promise.resolve({ id: "member_1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.employeeFindUnique).not.toHaveBeenCalled();
    expect(mocks.memberUpdate).toHaveBeenCalled();
  });

  it("allows managers to edit members outside their own store", async () => {
    mocks.getCurrentEmployee.mockResolvedValue({
      ...activeEmployee,
      roleCodes: ["store_manager"],
      roleLevel: "manager",
      roleName: "管理员",
      storeId: "store_1",
      permissions: ["member:write", "profile:write"],
    });
    mocks.memberFindFirst.mockResolvedValue({ ...currentMember, storeId: "store_2", ownerEmployeeId: "emp_2" });
    mocks.blacklistEntryFindFirst.mockResolvedValue(null);
    mocks.memberUpdate.mockResolvedValue({ ...currentMember, storeId: "store_2", ownerEmployeeId: "emp_2", status: "ACTIVE" });
    mocks.auditLogCreate.mockResolvedValue({ id: "audit_patch_manager" });
    mocks.transaction.mockImplementation(async (callback) => callback({
      member: { update: mocks.memberUpdate },
      auditLog: { create: mocks.auditLogCreate },
    }));

    const response = await memberDetailRoute.PATCH(
      new Request("https://example.test/api/v1/members/member_1", {
        method: "PATCH",
        body: JSON.stringify({ status: "ACTIVE" }),
      }),
      { params: Promise.resolve({ id: "member_1" }) },
    );
    expect(response.status).toBe(200);
    expect(mocks.memberUpdate).toHaveBeenCalled();
  });

  it("allows staff to edit members owned by another employee", async () => {
    mocks.getCurrentEmployee.mockResolvedValue({
      ...activeEmployee,
      permissions: ["member:write", "profile:write"],
    });
    mocks.memberFindFirst.mockResolvedValue({ ...currentMember, ownerEmployeeId: "emp_2" });

    const response = await memberDetailRoute.PATCH(
      new Request("https://example.test/api/v1/members/member_1", {
        method: "PATCH",
        body: JSON.stringify({ status: "ACTIVE" }),
      }),
      { params: Promise.resolve({ id: "member_1" }) },
    );
    expect(response.status).toBe(200);
    expect(mocks.employeeFindUnique).not.toHaveBeenCalled();
    expect(mocks.memberUpdate).toHaveBeenCalled();
  });

  it("allows managers to change a phone number for any member", async () => {
    mocks.getCurrentEmployee.mockResolvedValue({
      ...activeEmployee,
      roleCodes: ["store_manager"],
      roleLevel: "manager",
      roleName: "管理员",
      storeId: "store_1",
      permissions: ["member:write", "profile:write"],
    });
    mocks.memberFindFirst.mockResolvedValue({ ...currentMember, ownerEmployeeId: "emp_2" });
    mocks.employeeFindUnique.mockResolvedValue({ storeId: "store_1" });
    mocks.blacklistEntryFindFirst.mockResolvedValue(null);
    mocks.memberUpdate.mockResolvedValue({ ...currentMember, ownerEmployeeId: "emp_2", phoneEncrypted: "mvp:v1:MTM4MDAxMzgwMDA" });
    mocks.auditLogCreate.mockResolvedValue({ id: "audit_patch_manager_phone" });
    mocks.transaction.mockImplementation(async (callback) => callback({
      member: { update: mocks.memberUpdate },
      auditLog: { create: mocks.auditLogCreate },
    }));

    const response = await memberDetailRoute.PATCH(
      new Request("https://example.test/api/v1/members/member_1", {
        method: "PATCH",
        body: JSON.stringify({ phone: "13800138000" }),
      }),
      { params: Promise.resolve({ id: "member_1" }) },
    );
    expect(response.status).toBe(200);
    expect(mocks.memberUpdate).toHaveBeenCalled();
  });

  it("blocks changing member store through the member edit endpoint", async () => {
    mocks.getCurrentEmployee.mockResolvedValue({
      ...activeEmployee,
      employeeId: "emp_owner",
      roleCodes: ["admin"],
      roleLevel: "manager",
      roleName: "管理员",
      permissions: ["member:write", "profile:write"],
    });
    mocks.memberFindFirst.mockResolvedValue(currentMember);

    const response = await memberDetailRoute.PATCH(
      new Request("https://example.test/api/v1/members/member_1", {
        method: "PATCH",
        body: JSON.stringify({ storeId: "store_2" }),
      }),
      { params: Promise.resolve({ id: "member_1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({ code: 1002, message: "不能通过会员编辑直接调整门店" });
    expect(mocks.memberUpdate).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/members/{id}", () => {
  const deletableMember = {
    id: "member_1",
    storeId: "store_1",
    ownerEmployeeId: "emp_1",
    memberNo: "M20260712000001",
    name: "张三",
    status: "LEAD",
    _count: { billingOrders: 0 },
  };

  it("requires member:delete permission", async () => {
    mocks.getCurrentEmployee.mockResolvedValue(activeEmployee);

    const response = await memberDetailRoute.DELETE(
      new Request("https://example.test/api/v1/members/member_1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "member_1" }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.memberFindFirst).not.toHaveBeenCalled();
  });

  it("deletes own member for authorized staff and writes audit log", async () => {
    mocks.getCurrentEmployee.mockResolvedValue({
      ...activeEmployee,
      permissions: ["member:delete"],
    });
    mocks.memberFindFirst.mockResolvedValue(deletableMember);
    mocks.transaction.mockImplementation(async (callback) => callback({
      member: { delete: mocks.memberDelete },
      auditLog: { create: mocks.auditLogCreate },
    }));
    mocks.memberDelete.mockResolvedValue(deletableMember);
    mocks.auditLogCreate.mockResolvedValue({});

    const response = await memberDetailRoute.DELETE(
      new Request("https://example.test/api/v1/members/member_1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "member_1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.memberDelete).toHaveBeenCalledWith({ where: { id: "member_1" } });
    expect(mocks.auditLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "DELETE",
        resourceType: "Member",
        resourceId: "member_1",
      }),
    }));
    expect(body.data).toEqual({ id: "member_1" });
  });

});
