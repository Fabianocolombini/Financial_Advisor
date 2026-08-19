"use client";

import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { EmailPasswordForm } from "@/components/auth/EmailPasswordForm";

export function LoginPanel({
  googleConfigured,
  callbackUrl = "/homing",
}: {
  googleConfigured: boolean;
  callbackUrl?: string;
}) {
  return (
    <div className="space-y-4">
      {googleConfigured ? (
        <GoogleSignInButton variant="full" callbackUrl={callbackUrl} />
      ) : (
        <p className="rounded-md border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-100">
          Google OAuth is not configured in this environment.
        </p>
      )}
      <div className="flex items-center gap-3 text-[11px] text-zinc-600">
        <span className="h-px flex-1 bg-zinc-800" />
        or
        <span className="h-px flex-1 bg-zinc-800" />
      </div>
      <EmailPasswordForm callbackUrl={callbackUrl} />
    </div>
  );
}
