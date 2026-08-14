import Link from "next/link";
import { APP_LOCALE } from "@/lib/locale";
import { shiftMonth } from "@/lib/month";

export function BudgetMonthNav({
  year,
  month,
}: {
  year: number;
  month: number;
}) {
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const label = new Date(year, month - 1, 1).toLocaleDateString(APP_LOCALE, {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
      <Link
        href={`/budget?year=${prev.year}&month=${prev.month}`}
        className="text-sm text-zinc-400 hover:text-white"
      >
        ← Previous month
      </Link>
      <span className="font-title text-sm capitalize text-white">{label}</span>
      <Link
        href={`/budget?year=${next.year}&month=${next.month}`}
        className="text-sm text-zinc-400 hover:text-white"
      >
        Next month →
      </Link>
    </div>
  );
}
