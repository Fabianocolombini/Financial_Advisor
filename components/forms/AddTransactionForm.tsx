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
      setError(j.error ?? "Falha ao registrar");
      return;
    }
    (e.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
        Registrar gasto/receita (realizado)
      </h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">
          Categoria (opcional)
          <select
            name="categoryId"
            className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">Sem categoria</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">
          Valor (R$)
          <input
            name="amount"
            type="number"
            min={0.01}
            step="0.01"
            required
            className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">
          Data
          <input
            name="occurredAt"
            type="date"
            required
            defaultValue={defaultDate}
            className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="block text-xs text-zinc-600 dark:text-zinc-400 sm:col-span-2">
          Nota (opcional)
          <input
            name="note"
            maxLength={500}
            className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      </div>
      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "Salvando…" : "Registrar"}
      </button>
    </form>
  );
}
