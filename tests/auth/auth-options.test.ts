import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    employee: {
      findMany: mocks.findMany,
    },
  },
}));

vi.mock("@/lib/server/password", () => ({
  verifyPassword: mocks.verifyPassword,
}));

const { authOptions } = await import("@/business-support/permissions/options");

type CredentialsProviderForTest = {
  options: {
    authorize: (
      credentials?: Record<string, unknown>,
    ) => Promise<{
      id: string;
      email?: string | null;
      name?: string | null;
      employeeId?: string;
      storeId?: string | null;
      roleCodes?: string[];
      permissions?: string[];
    } | null>;
  };
};

const provider = authOptions.providers[0] as unknown as CredentialsProviderForTest;
const authorize = provider.options.authorize;

const originalBootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
const originalBootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;

afterEach(() => {
  process.env.BOOTSTRAP_ADMIN_EMAIL = originalBootstrapEmail;
  process.env.BOOTSTRAP_ADMIN_PASSWORD = originalBootstrapPassword;
  vi.clearAllMocks();
});

describe("NextAuth Credentials bootstrap login", () => {
  it("uses jwt sessions for API-side authorization checks", () => {
    expect(authOptions.session?.strategy).toBe("jwt");
  });

  it("accepts configured bootstrap admin credentials", async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = "admin@example.com";
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "correct-password";
    mocks.findMany.mockResolvedValue([]);

    const user = await authorize({
      email: "admin@example.com",
      password: "correct-password",
    });

    expect(user).toEqual({
      id: "bootstrap-admin",
      email: "admin@example.com",
      name: "Bootstrap Admin",
      employeeId: "bootstrap-admin",
      storeId: null,
      roleCodes: ["bootstrap-admin"],
      permissions: [],
    });
    expect(user).not.toHaveProperty("password");
    expect(user).not.toHaveProperty("passwordHash");
  });

  it("accepts active employee credentials and returns only authorization claims", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "emp_1",
        storeId: "store_1",
        email: "staff@example.com",
        name: "Staff User",
        passwordHash: "hashed-password",
        roles: [
          {
            role: {
              code: "operator",
              permissions: [{ code: "staff:read" }, { code: "staff:read" }],
            },
          },
          {
            role: {
              code: "admin",
              permissions: [{ code: "audit:read" }],
            },
          },
        ],
      },
    ]);
    mocks.verifyPassword.mockResolvedValue(true);

    const user = await authorize({
      email: "staff@example.com",
      password: "correct-password",
    });

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "staff@example.com", status: "ACTIVE" },
      }),
    );
    expect(user).toEqual({
      id: "emp_1",
      employeeId: "emp_1",
      email: "staff@example.com",
      name: "Staff User",
      storeId: "store_1",
      roleCodes: ["admin", "operator"],
      permissions: ["audit:read", "staff:read"],
    });
    expect(user).not.toHaveProperty("passwordHash");
  });

  it("rejects malformed email input before credential comparison", async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = "admin@example.com";
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "correct-password";
    mocks.findMany.mockResolvedValue([]);

    await expect(
      authorize({
        email: "not-an-email",
        password: "correct-password",
      }),
    ).resolves.toBeNull();
  });

  it("rejects wrong passwords and missing bootstrap configuration", async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = "admin@example.com";
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "correct-password";
    mocks.findMany.mockResolvedValue([]);

    await expect(
      authorize({
        email: "admin@example.com",
        password: "wrong-password",
      }),
    ).resolves.toBeNull();

    delete process.env.BOOTSTRAP_ADMIN_EMAIL;
    delete process.env.BOOTSTRAP_ADMIN_PASSWORD;

    await expect(
      authorize({
        email: "admin@example.com",
        password: "correct-password",
      }),
    ).resolves.toBeNull();
  });
});
