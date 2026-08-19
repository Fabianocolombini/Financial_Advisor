"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { formatPerf, formatPrice, perfClass } from "@/lib/format-market";
import type { HomingLotRow } from "@/lib/homing/build-homing";

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return USD.format(value);
}

function signedMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const formatted = USD.format(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return formatted;
}

function actionClass(action: string): string {
  if (action === "Buy more") return "text-emerald-400";
  if (action === "Exit" || action === "Downtrend — exit") return "text-red-400";
  return "text-zinc-300";
}

export function BookLotsTable({ lots }: { lots: HomingLotRow[] }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <table className="w-full text-left text-sm">
      <thead className="text-[11px] text-zinc-500">
        <tr>
          <th className="py-1.5 font-medium">Name</th>
          <th className="py-1.5 font-medium">Day</th>
          <th className="py-1.5 font-medium">Vs cost</th>
          <th className="py-1.5 font-medium">Call</th>
        </tr>
      </thead>
      <tbody>
        {lots.map((row) => {
          const expanded = open === row.symbol;
          return (
            <Fragment key={row.symbol}>
              <tr className="border-t border-zinc-800/80">
                <td className="py-2">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() =>
                      setOpen((current) =>
                        current === row.symbol ? null : row.symbol,
                      )
                    }
                    className="font-mono text-white hover:text-[#d4af37]"
                  >
                    {row.symbol}
                  </button>
                </td>
                <td className={`py-2 tabular-nums ${perfClass(row.dayPct)}`}>
                  {formatPerf(row.dayPct)}
                </td>
                <td className={`py-2 tabular-nums ${perfClass(row.vsCostPct)}`}>
                  {formatPerf(row.vsCostPct)}
                </td>
                <td className={`py-2 ${actionClass(row.action)}`} title={row.hint}>
                  {row.action}
                </td>
              </tr>
              {expanded ? (
                <tr className="border-t border-zinc-900">
                  <td colSpan={4} className="pb-3 pt-2 text-[12px] text-zinc-400">
                    <p className="leading-relaxed text-zinc-300">{row.hint}</p>
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums sm:grid-cols-4">
                      <div>
                        <dt className="text-[10px] uppercase tracking-wide text-zinc-600">
                          You paid
                        </dt>
                        <dd className="text-zinc-200">{money(row.costValue)}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-wide text-zinc-600">
                          Worth now
                        </dt>
                        <dd className="text-zinc-200">{money(row.marketValue)}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-wide text-zinc-600">
                          Day
                        </dt>
                        <dd className={perfClass(row.dayPct)}>
                          {signedMoney(row.dayPnl)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-wide text-zinc-600">
                          Vs cost
                        </dt>
                        <dd className={perfClass(row.vsCostPct)}>
                          {signedMoney(row.vsCostAbs)}
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-2 text-[11px] text-zinc-600">
                      {row.quantity} × last {formatPrice(row.last)} · cost{" "}
                      {formatPrice(row.costPrice)}
                    </p>
                    <Link
                      href={`/markets/${row.symbol}`}
                      className="mt-2 inline-block text-[11px] text-[#d4af37] hover:underline"
                    >
                      Open chart and movement
                    </Link>
                  </td>
                </tr>
              ) : null}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
