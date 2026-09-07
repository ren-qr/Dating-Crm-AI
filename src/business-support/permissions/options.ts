import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";
import { uniqueCodes } from "@/business-support/permissions/permissions";
import { verifyPassword } from "@/lib/server/password";
import { prisma } from "@/lib/server/prisma";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

async function findActiveEmployeeCandidates(email: string) {
  return prisma.employee.findMany({
    where: {
      email,
      status: "ACTIVE",
    },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  providers: [
    CredentialsProvider({
      name: "员工账号密码",
      credentials: {
        email: { label: "邮箱", type: "email" },
        password: { label: "密码", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);

        if (!parsed.success) {
          return null;
        }

        let employeeCandidates: Awaited<
          ReturnType<typeof findActiveEmployeeCandidates>
        > = [];

        try {
          employeeCandidates = await findActiveEmployeeCandidates(
            parsed.data.email,
          );
        } catch (error) {
          if (process.env.NODE_ENV === "production") {
            throw error;
          }
        }

        for (const employee of employeeCandidates) {
          const passwordMatches = await verifyPassword(
            parsed.data.password,
            employee.passwordHash,
          );

          if (!passwordMatches) {
            continue;
          }

          const roleCodes = uniqueCodes(
            employee.roles.map((staffRole) => staffRole.role.code),
          );
          const permissions = uniqueCodes(
            employee.roles.flatMap((staffRole) =>
              staffRole.role.permissions.map((permission) => permission.code),
            ),
          );

          return {
            id: employee.id,
            employeeId: employee.id,
            email: employee.email,
            name: employee.name,
            storeId: employee.storeId,
            roleCodes,
            permissions,
          };
        }

        const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
        const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;

        if (
          bootstrapEmail &&
          bootstrapPassword &&
          parsed.data.email === bootstrapEmail &&
          parsed.data.password === bootstrapPassword
        ) {
          return {
            id: "bootstrap-admin",
            employeeId: "bootstrap-admin",
            email: bootstrapEmail,
            name: "Bootstrap Admin",
            storeId: null,
            roleCodes: ["bootstrap-admin"],
            permissions: [],
          };
        }

        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.employeeId = user.employeeId;
        token.storeId = user.storeId;
        token.roleCodes = user.roleCodes;
        token.permissions = user.permissions;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.employeeId) {
        session.user.employeeId = token.employeeId;
        session.user.storeId = token.storeId ?? null;
        session.user.roleCodes = token.roleCodes ?? [];
        session.user.permissions = token.permissions ?? [];
      }

      return session;
    },
  },
  pages: {
    signIn: "/",
  },
};
