"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AddBudgetCategoryForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const name = String(fd.get("name") ?? "").trim();

    const res = await fetch("/api/budget/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    setPending(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Failed to create category");
      return;
    }
    form.reset();
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-wrap items-end gap-2 rounded-xl border border-zinc-800 bg-zinc-950 p-4"
    >
      <label className="block min-w-[12rem] flex-1 text-xs text-zinc-400">
        New category
        <input
          name="name"
          required
          placeholder="e.g. Housing"
          className="mt-1 w-full rounded-md border border-zinc-700 bg-black px-2 py-1.5 text-sm text-white"
        />
      </label>
      {error ? <p className="w-full text-xs text-red-400">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-black disabled:opacity-50"
      >
        {pending ? "…" : "Add"}
      </button>
    </form>
  );
}
