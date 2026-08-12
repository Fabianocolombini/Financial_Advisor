import type { NextAuthConfig } from "next-auth";
import { authEnabled } from "@/lib/auth-mode";

/** Edge-safe config for middleware — no Prisma or DB adapter. */
export const authConfig = {
  providers: [],
  pages: {
    signIn: "/auth/signin",
  },
  trustHost: true,
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      if (!authEnabled) return true;

      const path = nextUrl.pathname;
      if (path === "/" || path === "/login") return true;
      if (path.startsWith("/auth")) return true;
      if (path.startsWith("/api/auth")) return true;
      if (path.startsWith("/legal")) return true;

      const protectedExact = ["/patrimonio", "/objetivos", "/orcamento"];
      const needsAuth = protectedExact.includes(path);
      if (needsAuth) return !!auth?.user;
      return true;
    },
  },
} satisfies NextAuthConfig;
