import Link from "next/link";
import { MotorDataFreshness } from "@/components/home/MotorDataFreshness";
import { formatPerf } from "@/lib/format-market";
import { formatScore } from "@/lib/motor/format-scores";
import type { HomingChartPoint, HomingViewModel } from "@/lib/homing/build-homing";
import type { MotorDashboardSnapshot } from "@/lib/motor/snapshot-types";

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return USD.format(value);
}

function scoreDelta(value: number | null): string {
  if (value == null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(3)}`;
}

function HomingSpark({ points }: { points: HomingChartPoint[] }) {
  if (points.length < 2) return null;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.abs(max) * 0.02 || 1;
  const pad = span * 0.12;
  const lo = min - pad;
  const hi = max + pad;
  const w = 560;
  const h = 140;
  const coords = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (w - 24) + 12;
    const y = h - 20 - ((v - lo) / (hi - lo)) * (h - 36);
    return `${x},${y}`;
  });
  const lastUp = values[values.length - 1]! >= values[0]!;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-36 w-full"
      role="img"
      aria-label="Wallet market value yesterday versus now"
    >
      <polyline
        fill="none"
        stroke={lastUp ? "#34d399" : "#f87171"}
        strokeWidth="2.5"
        points={coords.join(" ")}
      />
      {points.map((p, i) => {
        const [x, y] = coords[i]!.split(",").map(Number);
        return (
          <g key={p.label}>
            <circle cx={x} cy={y} r="3.5" fill={lastUp ? "#34d399" : "#f87171"} />
            <text
              x={x}
              y={h - 4}
              textAnchor="middle"
              className="fill-zinc-500"
              style={{ fontSize: 11 }}
            >
              {p.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function actionClass(action: string): string {
  if (action === "Buy more") return "text-emerald-400";
  if (action === "Exit" || action === "Downtrend — exit") return "text-red-400";
  return "text-zinc-300";
}

export function HomingView({
  view,
  snapshot,
}: {
  view: HomingViewModel;
  snapshot: MotorDashboardSnapshot | null;
}) {
  const dayTone =
    view.book.dayPnl == null
      ? "text-zinc-400"
      : view.book.dayPnl >= 0
        ? "text-emerald-400"
        : "text-red-400";

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="font-title text-2xl tracking-tight text-white">Homing</h1>
        <p className="font-body max-w-2xl text-sm text-zinc-400">
          Yesterday vs today. How the book moved, and which names got closer to
          a buy.
        </p>
        <MotorDataFreshness snapshot={snapshot} prominent />
      </div>

      {view.book.chart.length >= 2 ? (
        <section className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
            Book value
          </p>
          <HomingSpark points={view.book.chart} />
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="font-title text-lg text-white">My book</h2>
          <p className="text-sm text-zinc-500">
            What you already own. Hold, buy more, or exit — vs yesterday.
          </p>
          <div className="flex flex-wrap gap-6">
            <div>
              <p className={`text-xl tabular-nums ${dayTone}`}>
                {view.book.dayPnl == null
                  ? "—"
                  : `${view.book.dayPnl >= 0 ? "+" : ""}${money(view.book.dayPnl)}`}
              </p>
              <p className="text-[11px] text-zinc-500">Day P&L</p>
            </div>
            <div>
              <p className={`text-xl tabular-nums ${dayTone}`}>
                {formatPerf(view.book.dayPct)}
              </p>
              <p className="text-[11px] text-zinc-500">Vs yesterday</p>
            </div>
            <div>
              <p className="text-xl tabular-nums text-amber-300">
                {view.book.decisionCount}
              </p>
              <p className="text-[11px] text-zinc-500">Need a decision</p>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-zinc-300">
            {view.book.narrative}
          </p>
          {!view.book.empty ? (
            <p className="text-[11px] text-zinc-600">
              Now {money(view.book.gross)} · invested {money(view.book.invested)}
            </p>
          ) : null}
          {view.book.empty ? (
            <p className="text-sm text-zinc-600">
              Buy from Markets — lots you add land here the next morning.
            </p>
          ) : (
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
                {view.book.lots.map((row) => (
                  <tr key={row.symbol} className="border-t border-zinc-800/80">
                    <td className="py-2">
                      <Link
                        href={`/markets/${row.symbol}`}
                        className="font-mono text-white hover:text-[#d4af37]"
                      >
                        {row.symbol}
                      </Link>
                    </td>
                    <td className="py-2 tabular-nums text-zinc-300">
                      {formatPerf(row.dayPct)}
                    </td>
                    <td className="py-2 tabular-nums text-zinc-300">
                      {formatPerf(row.vsCostPct)}
                    </td>
                    <td className={`py-2 ${actionClass(row.action)}`} title={row.hint}>
                      {row.action}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="font-title text-lg text-white">Approaching a buy</h2>
          <p className="text-sm text-zinc-500">
            Names you do not own. Only Can add — who gained score vs the
            previous close, or who is already eligible.
          </p>
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-xl tabular-nums text-emerald-400">
                {view.approaching.canAddCount}
              </p>
              <p className="text-[11px] text-zinc-500">Now Can add</p>
            </div>
            <div>
              <p className="text-xl tabular-nums text-white">
                {view.approaching.scoreJumpedCount}
              </p>
              <p className="text-[11px] text-zinc-500">Score jumped</p>
            </div>
            <div>
              <p className="text-xl tabular-nums text-sky-400">
                {view.approaching.flippedCount}
              </p>
              <p className="text-[11px] text-zinc-500">New vs previous close</p>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-zinc-300">
            {view.approaching.narrative}
          </p>
          {view.approaching.rows.length === 0 ? (
            <p className="text-sm text-zinc-600">No Can add names today.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] text-zinc-500">
                <tr>
                  <th className="py-1.5 font-medium">Name</th>
                  <th className="py-1.5 font-medium">Score Δ</th>
                  <th className="py-1.5 font-medium">1D</th>
                  <th className="py-1.5 font-medium">Score</th>
                </tr>
              </thead>
              <tbody>
                {view.approaching.rows.map((row) => (
                  <tr key={row.symbol} className="border-t border-zinc-800/80">
                    <td className="py-2">
                      <Link
                        href={`/markets/${row.symbol}`}
                        className="font-mono text-white hover:text-[#d4af37]"
                      >
                        {row.symbol}
                      </Link>
                      <span className="ml-2 text-[11px] text-zinc-600">
                        {row.classLabel}
                      </span>
                    </td>
                    <td className="py-2 tabular-nums text-zinc-300">
                      {scoreDelta(row.scoreDelta)}
                    </td>
                    <td className="py-2 tabular-nums text-zinc-300">
                      {formatPerf(row.perf1dPct)}
                    </td>
                    <td className="py-2 tabular-nums text-zinc-400">
                      {formatScore(row.score)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <p className="text-[10px] text-zinc-600">
        Educational use only — not investment advice. Weekday email reprints
        these two chapters.
      </p>
    </div>
  );
}
