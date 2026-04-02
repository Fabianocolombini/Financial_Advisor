"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatBRL } from "@/lib/format";
import { DeleteApiButton } from "./DeleteApiButton";

export function EditBudgetEntryRow({
  entryId,
  categoryName,
  plannedAmount,
}: {
  entryId: string;
  categoryName: string;
  plannedAmount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const plannedAmountNew = Number(fd.get("plannedAmount"));

    const res = await fetch(`/api/budget/entries/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plannedAmount: plannedAmountNew }),
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
    <li className="p-4 text-sm">
      {!open ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            <span className="font-medium text-zinc-900 dark:text-zinc-50">
              {categoryName}
            </span>
            <span className="text-zinc-600 dark:text-zinc-400">
              {" "}
              — planejado {formatBRL(plannedAmount)}
            </span>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="text-xs text-zinc-500 underline"
            >
              Editar
            </button>
            <DeleteApiButton url={`/api/budget/entries/${entryId}`} />
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
          <span className="font-medium text-zinc-900 dark:text-zinc-50">
            {categoryName}
          </span>
          <label className="text-xs text-zinc-600 dark:text-zinc-400">
            R$
            <input
              name="plannedAmount"
              type="number"
              min={0}
              step="0.01"
              required
              defaultValue={plannedAmount}
              className="ml-1 w-28 rounded-md border border-zinc-200 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          {error ? (
            <span className="w-full text-xs text-red-600">{error}</span>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-zinc-900 px-2 py-1 text-xs text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            OK
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs text-zinc-500"
          >
            Cancelar
          </button>
        </form>
      )}
    </li>
  );
}
