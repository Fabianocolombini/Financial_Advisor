import { auth } from "@/auth";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { authEnabled } from "@/lib/auth-mode";
import { redirect } from "next/navigation";
import { GoogleSetupHelp } from "./google-setup-help";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  if (!authEnabled) redirect("/");

  const session = await auth();
  if (session?.user) redirect("/");

  const googleConfigured =
    Boolean(process.env.AUTH_GOOGLE_ID) && Boolean(process.env.AUTH_GOOGLE_SECRET);

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center bg-black px-4 py-12">
      <div className="w-full max-w-sm text-center">
        <h1 className="font-title text-3xl tracking-tight text-white sm:text-4xl">
          Financial Advisor
        </h1>
        <p className="font-body mt-3 text-sm text-zinc-400">
          Personal finance planning. Sign in with Google to continue.
        </p>

        <div className="mt-12 flex flex-col items-center gap-6">
          {googleConfigured ? (
            <>
              <GoogleSignInButton />
              <p className="font-body text-xs text-zinc-500">
                Tap the Google logo to sign in
              </p>
            </>
          ) : (
            <>
              <p className="rounded-lg border border-amber-900/50 bg-amber-950/30 p-4 text-left text-sm text-amber-100">
                Set <code className="font-mono text-xs">AUTH_GOOGLE_ID</code> and{" "}
                <code className="font-mono text-xs">AUTH_GOOGLE_SECRET</code> in{" "}
                <code className="font-mono text-xs">.env.local</code> and restart the
                server.
              </p>
              <GoogleSetupHelp />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
