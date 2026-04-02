"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatBRL } from "@/lib/format";

type Goal = {
  id: string;
  title: string;
  targetAmount: number;
  deadline: Date | null;
};

export function EditGoalRow({ goal }: { goal: Goal }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get("title") ?? "").trim();
    const targetAmount = Number(fd.get("targetAmount"));
    const deadlineRaw = String(fd.get("deadline") ?? "").trim();

    const res = await fetch(`/api/goals/${goal.id}`, {
      method: "PATCH",
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
      setError(j.error ?? "Falha ao salvar");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  const deadlineStr = goal.deadline
    ? goal.deadline.toISOString().slice(0, 10)
    : "";

  return (
    <div className="p-4">
      {!open ? (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium text-zinc-900 dark:text-zinc-50">
              {goal.title}
            </p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Alvo: {formatBRL(goal.targetAmount)}
              {goal.deadline
                ? ` · até ${goal.deadline.toLocaleDateString("pt-BR")}`
                : ""}
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
            name="title"
            required
            defaultValue={goal.title}
            className="w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <div className="flex flex-wrap gap-2">
            <input
              name="targetAmount"
              type="number"
              min={0.01}
              step="0.01"
              required
              defaultValue={goal.targetAmount}
              className="w-36 rounded-md border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <input
              name="deadline"
              type="date"
              defaultValue={deadlineStr}
              className="rounded-md border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
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
