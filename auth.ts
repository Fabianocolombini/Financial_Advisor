import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { authEnabled } from "@/lib/auth-mode";
import { prisma } from "@/lib/prisma";

function authSecret(): string {
  const s = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    console.error(
      "[auth] AUTH_SECRET ausente — defina em Vercel (Settings → Environment Variables). Gere: openssl rand -base64 32",
    );
  } else {
    console.warn(
      "[auth] AUTH_SECRET ausente — usando fallback só para dev. Crie .env.local: AUTH_SECRET=$(openssl rand -base64 32)",
    );
  }
  return "insecure-fallback-define-AUTH_SECRET-openssl-rand-base64-32!!";
}

const googleConfigured =
  Boolean(process.env.AUTH_GOOGLE_ID) && Boolean(process.env.AUTH_GOOGLE_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: authSecret(),
  adapter: PrismaAdapter(prisma),
  providers: googleConfigured
    ? [
        Google({
          clientId: process.env.AUTH_GOOGLE_ID!,
          clientSecret: process.env.AUTH_GOOGLE_SECRET!,
          authorization: {
            params: {
              prompt: "select_account",
            },
          },
        }),
      ]
    : [],
  session: { strategy: "database" },
  pages: {
    signIn: "/auth/signin",
  },
  trustHost: true,
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      if (!authEnabled) return true;

      const path = nextUrl.pathname;
      if (path.startsWith("/auth")) return true;
      if (path.startsWith("/api/auth")) return true;
      if (path.startsWith("/legal")) return true;

      const protectedExact = ["/", "/patrimonio", "/objetivos", "/orcamento"];
      const needsAuth = protectedExact.includes(path);
      if (needsAuth) return !!auth?.user;
      return true;
    },
    session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
});
