"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Category = { id: string; name: string };

export function AddTransactionForm({
  categories,
  defaultYear,
  defaultMonth,
}: {
  categories: Category[];
  defaultYear: number;
  defaultMonth: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultDate = `${defaultYear}-${String(defaultMonth).padStart(2, "0")}-15`;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const categoryIdRaw = String(fd.get("categoryId") ?? "");
    const categoryId = categoryIdRaw === "" ? undefined : categoryIdRaw;
    const amount = Number(fd.get("amount"));
    const occurredAt = String(fd.get("occurredAt") ?? "");
    const noteRaw = String(fd.get("note") ?? "").trim();

    const [y, mo, d] = occurredAt.split("-").map(Number);
    const atLocal = new Date(y, mo - 1, d, 12, 0, 0, 0);

    const res = await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId: categoryId ?? null,
        amount,
        occurredAt: atLocal.toISOString(),
        note: noteRaw || undefined,
      }),
    });
    setPending(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Failed to record transaction");
      return;
    }
    (e.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4"
    >
      <h3 className="font-title text-sm text-white">Record income or expense</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs text-zinc-400">
          Category (optional)
          <select
            name="categoryId"
            className="mt-1 w-full rounded-md border border-zinc-700 bg-black px-2 py-1.5 text-sm text-white"
          >
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
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
        <label className="block text-xs text-zinc-400">
          Date
          <input
            name="occurredAt"
            type="date"
            required
            defaultValue={defaultDate}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-black px-2 py-1.5 text-sm text-white"
          />
        </label>
        <label className="block text-xs text-zinc-400 sm:col-span-2">
          Note (optional)
          <input
            name="note"
            maxLength={500}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-black px-2 py-1.5 text-sm text-white"
          />
        </label>
      </div>
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
