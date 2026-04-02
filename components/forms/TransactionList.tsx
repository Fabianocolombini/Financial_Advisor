"use client";

import { formatBRL } from "@/lib/format";
import { DeleteApiButton } from "./DeleteApiButton";

type Row = {
  id: string;
  amount: number;
  occurredAt: string;
  note: string | null;
  category: { id: string; name: string } | null;
};

export function TransactionList({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return (
      <p className="p-4 text-sm text-zinc-500 dark:text-zinc-400">
        Nenhuma transação neste mês.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
      {rows.map((t) => (
        <li
          key={t.id}
          className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm"
        >
          <div>
            <span className="font-medium text-zinc-900 dark:text-zinc-50">
              {formatBRL(t.amount)}
            </span>
            <span className="text-zinc-600 dark:text-zinc-400">
              {" "}
              · {new Date(t.occurredAt).toLocaleDateString("pt-BR")}
              {t.category ? ` · ${t.category.name}` : " · Sem categoria"}
            </span>
            {t.note ? (
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {t.note}
              </p>
            ) : null}
          </div>
          <DeleteApiButton url={`/api/transactions/${t.id}`} />
        </li>
      ))}
    </ul>
  );
}
