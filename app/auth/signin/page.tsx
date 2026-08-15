import { auth } from "@/auth";
import { LoginPanel } from "@/components/auth/LoginPanel";
import { authEnabled } from "@/lib/auth-mode";
import Image from "next/image";
import { redirect } from "next/navigation";
import { GoogleSetupHelp } from "./google-setup-help";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  if (!authEnabled) redirect("/markets");

  const session = await auth();
  if (session?.user) redirect("/markets");

  const googleConfigured =
    Boolean(process.env.AUTH_GOOGLE_ID) && Boolean(process.env.AUTH_GOOGLE_SECRET);

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center bg-black px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="font-title flex items-center justify-center gap-2 text-3xl tracking-tight text-white sm:text-4xl">
          <Image
            src="/atlas-logo.jpg"
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 rounded-full object-cover object-top"
          />
          Atlas
        </h1>
        <p className="mt-3 text-center text-sm text-zinc-400">
          Sign in to access the motor, technicals, and wallet.
        </p>
        <div className="mt-8">
          <LoginPanel googleConfigured={googleConfigured} />
        </div>
        {!googleConfigured ? (
          <div className="mt-6">
            <GoogleSetupHelp />
          </div>
        ) : null}
      </div>
    </div>
  );
}
