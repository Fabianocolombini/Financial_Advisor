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
      setError(j.error ?? "Failed to save");
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
            <span className="font-medium text-white">{categoryName}</span>
            <span className="text-zinc-400"> — planned {formatBRL(plannedAmount)}</span>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="text-xs text-zinc-500 underline"
            >
              Edit
            </button>
            <DeleteApiButton url={`/api/budget/entries/${entryId}`} />
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
          <span className="font-medium text-white">{categoryName}</span>
          <label className="text-xs text-zinc-400">
            BRL
            <input
              name="plannedAmount"
              type="number"
              min={0}
              step="0.01"
              required
              defaultValue={plannedAmount}
              className="ml-1 w-28 rounded-md border border-zinc-700 bg-black px-2 py-1 text-white"
            />
          </label>
          {error ? <span className="w-full text-xs text-red-400">{error}</span> : null}
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-white px-2 py-1 text-xs text-black"
          >
            OK
          </button>
          <button type="button" onClick={() => setOpen(false)} className="text-xs text-zinc-500">
            Cancel
          </button>
        </form>
      )}
    </li>
  );
}
