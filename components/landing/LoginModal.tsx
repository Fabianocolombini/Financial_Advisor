"use client";

import { useEffect } from "react";
import { LoginPanel } from "@/components/auth/LoginPanel";

export function LoginModal({
  open,
  onClose,
  googleConfigured,
}: {
  open: boolean;
  onClose: () => void;
  googleConfigured: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
        className="relative w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 id="login-title" className="font-title text-lg text-white">
              Sign in to Atlas
            </h2>
            <p className="mt-1 text-[11px] text-zinc-500">
              The motor, technicals, and wallet sit behind the login.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-xs text-zinc-500 hover:text-white"
          >
            ✕
          </button>
        </div>
        <LoginPanel googleConfigured={googleConfigured} />
      </div>
    </div>
  );
}
