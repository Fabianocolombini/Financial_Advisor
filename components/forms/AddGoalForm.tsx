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
      setError(j.error ?? "Failed to create goal");
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
      <h2 className="font-title text-sm text-white">New goal</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs text-zinc-400">
          Title
          <input
            name="title"
            required
            className="mt-1 w-full rounded-md border border-zinc-700 bg-black px-2 py-1.5 text-sm text-white"
          />
        </label>
        <label className="block text-xs text-zinc-400">
          Target amount (BRL)
          <input
            name="targetAmount"
            type="number"
            min={0.01}
            step="0.01"
            required
            className="mt-1 w-full rounded-md border border-zinc-700 bg-black px-2 py-1.5 text-sm text-white"
          />
        </label>
      </div>
      <label className="block text-xs text-zinc-400">
        Deadline (optional)
        <input
          name="deadline"
          type="date"
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
