"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatBRL } from "@/lib/format";

type Item = {
  id: string;
  label: string;
  kind: "ASSET" | "LIABILITY";
  amount: number;
};

export function EditBalanceItemRow({ item }: { item: Item }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const label = String(fd.get("label") ?? "").trim();
    const kind = fd.get("kind") as "ASSET" | "LIABILITY";
    const amount = Number(fd.get("amount"));

    const res = await fetch(`/api/balance-items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, kind, amount }),
    });
    setPending(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Falha ao salvar");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="p-4">
      {!open ? (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium text-zinc-900 dark:text-zinc-50">
              {item.label}
            </p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {item.kind === "ASSET" ? "Ativo" : "Passivo"} ·{" "}
              {formatBRL(item.amount)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-xs text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-300"
          >
            Editar
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-2">
          <input
            name="label"
            required
            defaultValue={item.label}
            className="w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <div className="flex flex-wrap gap-2">
            <select
              name="kind"
              required
              defaultValue={item.kind}
              className="rounded-md border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="ASSET">Ativo</option>
              <option value="LIABILITY">Passivo</option>
            </select>
            <input
              name="amount"
              type="number"
              min={0.01}
              step="0.01"
              required
              defaultValue={item.amount}
              className="w-36 rounded-md border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          {error ? (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-zinc-900 px-2 py-1 text-xs text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Salvar
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-zinc-500"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
