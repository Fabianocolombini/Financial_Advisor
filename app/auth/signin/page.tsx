import { auth } from "@/auth";
import { authEnabled } from "@/lib/auth-mode";
import { redirect } from "next/navigation";
import { GoogleSetupHelp } from "./google-setup-help";
import { SignInWithGoogle } from "./sign-in-button";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  if (!authEnabled) redirect("/");

  const session = await auth();
  if (session?.user) redirect("/");

  const googleConfigured =
    Boolean(process.env.AUTH_GOOGLE_ID) && Boolean(process.env.AUTH_GOOGLE_SECRET);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center px-4 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Entrar com Google
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        O acesso ao Financial Advisor é feito apenas com conta Google (OAuth 2.0).
      </p>
      <div className="mt-8 space-y-6">
        {googleConfigured ? (
          <>
            <SignInWithGoogle />
            <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
              Ao continuar, você será redirecionado para o Google para autorizar o
              aplicativo.
            </p>
          </>
        ) : (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            Defina <code className="font-mono text-xs">AUTH_GOOGLE_ID</code> e{" "}
            <code className="font-mono text-xs">AUTH_GOOGLE_SECRET</code> no arquivo{" "}
            <code className="font-mono text-xs">.env.local</code> na raiz do projeto,
            depois reinicie o servidor (<code className="font-mono text-xs">npm run dev</code>).
          </p>
        )}
        {!googleConfigured ? <GoogleSetupHelp /> : null}
      </div>
    </div>
  );
}
