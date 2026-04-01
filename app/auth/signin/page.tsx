import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { SignInWithGoogle } from "./sign-in-button";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  const googleConfigured =
    Boolean(process.env.AUTH_GOOGLE_ID) && Boolean(process.env.AUTH_GOOGLE_SECRET);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Entrar
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Use sua conta Google para acessar o Financial Advisor.
      </p>
      <div className="mt-8">
        {googleConfigured ? (
          <SignInWithGoogle />
        ) : (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            Configure <code className="font-mono text-xs">AUTH_GOOGLE_ID</code> e{" "}
            <code className="font-mono text-xs">AUTH_GOOGLE_SECRET</code> no{" "}
            <code className="font-mono text-xs">.env.local</code>.
          </p>
        )}
      </div>
    </div>
  );
}
