"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";

const fieldClass =
  "mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-600";

export function EmailPasswordForm({
  callbackUrl = "/homing",
}: {
  callbackUrl?: string;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "register") {
        const res = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(json.error ?? "Could not create the account.");
          return;
        }
      }

      const result = await signIn("credentials", {
        email,
        password,
        callbackUrl,
        redirect: false,
      });
      if (result?.error) {
        setError(
          mode === "register"
            ? "Account created, but sign-in failed. Try again."
            : "Invalid email or password.",
        );
        return;
      }
      window.location.href = callbackUrl;
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3">
      <label className="block text-[11px] text-zinc-400">
        Email
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={fieldClass}
        />
      </label>
      <label className="block text-[11px] text-zinc-400">
        Password
        <input
          type="password"
          required
          minLength={8}
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={fieldClass}
        />
      </label>
      {error ? <p className="text-[11px] text-red-400">{error}</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-sky-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-400 disabled:opacity-50"
      >
        {busy ? "Please wait…" : mode === "register" ? "Create account" : "Sign in"}
      </button>
      <p className="text-center text-[11px] text-zinc-500">
        {mode === "login" ? (
          <button
            type="button"
            className="text-zinc-300 underline-offset-2 hover:underline"
            onClick={() => {
              setMode("register");
              setError(null);
            }}
          >
            Create account
          </button>
        ) : (
          <button
            type="button"
            className="text-zinc-300 underline-offset-2 hover:underline"
            onClick={() => {
              setMode("login");
              setError(null);
            }}
          >
            I already have an account
          </button>
        )}
      </p>
    </form>
  );
}
