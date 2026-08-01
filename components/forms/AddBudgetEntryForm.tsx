"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Category = { id: string; name: string };

export function AddBudgetEntryForm({
  categories,
  year,
  month,
}: {
  categories: Category[];
  year: number;
  month: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (categories.length === 0) {
    return (
      <p className="text-sm text-zinc-500">Create a category above to set planned amounts.</p>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const categoryId = String(fd.get("categoryId"));
    const plannedAmount = Number(fd.get("plannedAmount"));

    const res = await fetch("/api/budget/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId, year, month, plannedAmount }),
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
      <h3 className="font-title text-sm text-white">
        Planned for {month}/{year}
      </h3>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block text-xs text-zinc-400">
          Category
          <select
            name="categoryId"
            required
            className="mt-1 block min-w-[10rem] rounded-md border border-zinc-700 bg-black px-2 py-1.5 text-sm text-white"
          >
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
            name="plannedAmount"
            type="number"
            min={0}
            step="0.01"
            required
            className="mt-1 w-28 rounded-md border border-zinc-700 bg-black px-2 py-1.5 text-sm text-white"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-black disabled:opacity-50"
        >
          {pending ? "…" : "Save"}
        </button>
      </div>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </form>
  );
}
