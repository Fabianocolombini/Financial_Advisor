import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";

function authSecret(): string {
  const s = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[auth] AUTH_SECRET ausente em produção — defina na Vercel (openssl rand -base64 32)",
    );
  }
  console.warn(
    "[auth] AUTH_SECRET ausente — fallback só para dev local. .env.local: AUTH_SECRET=$(openssl rand -base64 32)",
  );
  return "insecure-fallback-define-AUTH_SECRET-openssl-rand-base64-32!!";
}

const googleConfigured =
  Boolean(process.env.AUTH_GOOGLE_ID) && Boolean(process.env.AUTH_GOOGLE_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
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
  // JWT sessions — required so Edge middleware can read auth (database sessions fail on Edge).
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  callbacks: {
    ...authConfig.callbacks,
    jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) session.user.id = token.id as string;
      return session;
    },
  },
});
