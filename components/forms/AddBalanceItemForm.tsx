"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AddBalanceItemForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const label = String(fd.get("label") ?? "").trim();
    const kind = fd.get("kind") as "ASSET" | "LIABILITY";
    const amount = Number(fd.get("amount"));

    const res = await fetch("/api/balance-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, kind, amount }),
    });

    setPending(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Failed to save");
      return;
    }
    form.reset();
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4"
    >
      <h2 className="font-title text-sm text-white">New item</h2>
      <label className="block text-xs text-zinc-400">
        Name
        <input
          name="label"
          required
          className="mt-1 w-full rounded-md border border-zinc-700 bg-black px-2 py-1.5 text-sm text-white"
        />
      </label>
      <label className="block text-xs text-zinc-400">
        Type
        <select
          name="kind"
          required
          className="mt-1 w-full rounded-md border border-zinc-700 bg-black px-2 py-1.5 text-sm text-white"
        >
          <option value="ASSET">Asset</option>
          <option value="LIABILITY">Liability</option>
        </select>
      </label>
      <label className="block text-xs text-zinc-400">
        Amount (BRL)
        <input
          name="amount"
          type="number"
          min={0.01}
          step="0.01"
          required
          className="mt-1 w-full rounded-md border border-zinc-700 bg-black px-2 py-1.5 text-sm text-white"
        />
      </label>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-black disabled:opacity-50"
      >
        {pending ? "Saving…" : "Add"}
      </button>
    </form>
  );
}
