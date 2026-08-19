"use client";

import { useState } from "react";

export type DigestMailState = {
  email: string | null;
  enabled: boolean;
  lastEmailedAt: string | null;
  emailConfigured: boolean;
};

function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

export function DigestMailCard({ initial }: { initial: DigestMailState }) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const last = formatWhen(initial.lastEmailedAt);

  const post = async (action: "enable" | "disable" | "test") => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/digest-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = (await res.json()) as { error?: string; detail?: string };
      if (!res.ok) {
        setError([json.error, json.detail].filter(Boolean).join(" "));
        return;
      }
      if (action === "enable") {
        setEnabled(true);
        setMessage("Allowed. Weekdays after the US close, this digest goes to your email.");
      } else if (action === "disable") {
        setEnabled(false);
        setMessage("Stopped. You will not get Daily Digest by email.");
      } else {
        setMessage("Test sent. Check the inbox for the address on this account.");
      }
    } catch {
      setError("Could not save the preference.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
        Daily Digest by email
      </p>
      <p className="mt-1 text-sm text-zinc-300">
        Atlas already has the address from your login
        {initial.email ? (
          <>
            : <span className="text-white">{initial.email}</span>
          </>
        ) : (
          ". Sign in with Google so there is an address to send to."
        )}
      </p>
      <p className="mt-1 text-[12px] text-zinc-500">
        Weekdays after the US close — the same two chapters as this page. Not
        on Saturday or Sunday.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {enabled ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void post("disable")}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:border-zinc-500 disabled:opacity-50"
            >
              Stop sending
            </button>
            <button
              type="button"
              disabled={busy || !initial.email}
              onClick={() => void post("test")}
              className="rounded-md bg-[#d4af37] px-3 py-1.5 text-sm text-black hover:bg-[#e0c056] disabled:opacity-50"
            >
              Send a test now
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={busy || !initial.email}
            onClick={() => void post("enable")}
            className="rounded-md bg-[#d4af37] px-3 py-1.5 text-sm text-black hover:bg-[#e0c056] disabled:opacity-50"
          >
            Allow Daily Digest by email
          </button>
        )}
      </div>
      {enabled ? (
        <p className="mt-2 text-[11px] text-emerald-400/90">
          Allowed{last ? ` · last delivered ${last} ET` : " · waiting for the next weekday send"}
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-zinc-600">Not allowed yet.</p>
      )}
      {message ? <p className="mt-1 text-[12px] text-zinc-300">{message}</p> : null}
      {error ? <p className="mt-1 text-[12px] text-red-400">{error}</p> : null}
      {!initial.emailConfigured ? (
        <p className="mt-1 text-[11px] text-amber-200/80">
          The weekday job is ready. Delivery still needs a verified From
          domain in Resend.
        </p>
      ) : null}
    </section>
  );
}
