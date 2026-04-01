"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AddGoalForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const title = String(fd.get("title") ?? "").trim();
    const targetAmount = Number(fd.get("targetAmount"));
    const deadlineRaw = String(fd.get("deadline") ?? "").trim();

    const res = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        targetAmount,
        deadline: deadlineRaw ? new Date(deadlineRaw).toISOString() : null,
      }),
    });

    setPending(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Falha ao criar meta");
      return;
    }
    form.reset();
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
        Nova meta
      </h2>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">
          Título
          <input
            name="title"
            required
            className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">
          Valor alvo (R$)
          <input
            name="targetAmount"
            type="number"
            min={0.01}
            step="0.01"
            required
            className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      </div>
      <label className="block text-xs text-zinc-600 dark:text-zinc-400">
        Prazo (opcional)
        <input
          name="deadline"
          type="date"
          className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "Salvando…" : "Adicionar"}
      </button>
    </form>
  );
}
