import type { DefaultSession, DefaultUser } from "next-auth";
import type { JWT as DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      employeeId: string;
      storeId: string | null;
      roleCodes: string[];
      permissions: string[];
    };
  }

  interface User extends DefaultUser {
    employeeId: string;
    storeId: string | null;
    roleCodes: string[];
    permissions: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    employeeId?: string;
    storeId?: string | null;
    roleCodes?: string[];
    permissions?: string[];
  }
}
