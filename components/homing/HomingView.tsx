import Link from "next/link";
import { MotorDataFreshness } from "@/components/home/MotorDataFreshness";
import { BookLotsTable } from "@/components/homing/BookLotsTable";
import { formatPerf, perfClass } from "@/lib/format-market";
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

function signedMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const formatted = USD.format(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return formatted;
}

function pnlTone(value: number | null | undefined): string {
  if (value == null) return "text-zinc-400";
  if (value > 0) return "text-emerald-400";
  if (value < 0) return "text-red-400";
  return "text-zinc-400";
}

function scoreDelta(value: number | null): string {
  if (value == null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(3)}`;
}

function shortDate(label: string): string {
  if (label === "Now" || label === "Yesterday") return label;
  const d = new Date(`${label}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return label;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function moneyTone(label: string): string {
  if (label === "Can add") return "text-emerald-400";
  if (label === "Wait") return "text-amber-300";
  if (label === "Do not add") return "text-red-400";
  return "text-zinc-400";
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
  const labelAt = new Set(
    points.length <= 4
      ? points.map((_, i) => i)
      : [0, Math.floor((points.length - 1) / 2), points.length - 1],
  );

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-36 w-full"
      role="img"
      aria-label="Wallet market value, session by session"
    >
      <polyline
        fill="none"
        stroke={lastUp ? "#34d399" : "#f87171"}
        strokeWidth="2.5"
        points={coords.join(" ")}
      />
      {points.map((p, i) => {
        if (!labelAt.has(i)) return null;
        const [x, y] = coords[i]!.split(",").map(Number);
        return (
          <g key={`${p.label}-${i}`}>
            <circle cx={x} cy={y} r="3.5" fill={lastUp ? "#34d399" : "#f87171"} />
            <text
              x={x}
              y={h - 4}
              textAnchor="middle"
              className="fill-zinc-500"
              style={{ fontSize: 11 }}
            >
              {shortDate(p.label)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div>
      <p className={`text-xl tabular-nums ${tone ?? "text-white"}`}>{value}</p>
      <p className="text-[11px] text-zinc-500">{label}</p>
      {hint ? <p className="text-[10px] text-zinc-600">{hint}</p> : null}
    </div>
  );
}

export function HomingView({
  view,
  snapshot,
}: {
  view: HomingViewModel;
  snapshot: MotorDashboardSnapshot | null;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="font-title text-2xl tracking-tight text-white">
          Daily Digest
        </h1>
        <p className="font-body max-w-2xl text-sm text-zinc-400">
          Two columns: what you already own, and who is getting closer to a
          buy. Price going up is not the same as Money +.
        </p>
        <MotorDataFreshness snapshot={snapshot} prominent />
      </div>

      {view.book.chart.length >= 2 ? (
        <section className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
            Book value, session by session
          </p>
          <HomingSpark points={view.book.chart} />
        </section>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="font-title text-lg text-white">My book</h2>
          <p className="text-sm text-zinc-500">
            Cost is what you paid. Worth now is the live book. Vs cost is
            since you bought. Vs yesterday is one session. The call is Hold,
            Buy more, or Exit — click a name for the movement.
          </p>
          {view.book.incomplete ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100/90">
              {view.book.quotedLots} of {view.book.totalLots} lots have a live
              price. {money(view.book.unquotedCost)} of cost is still unquoted —
              that gap is missing prices, not a loss. Vs cost below uses only
              the quoted names.
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Stat label="You paid" value={money(view.book.invested)} />
            <Stat
              label="Worth now"
              value={money(view.book.gross)}
              hint={
                view.book.incomplete ? "Quoted lots only" : undefined
              }
            />
            <Stat
              label="Vs cost"
              value={
                view.book.vsCostAbs == null
                  ? "—"
                  : `${signedMoney(view.book.vsCostAbs)} · ${formatPerf(view.book.vsCostPct)}`
              }
              hint={view.book.incomplete ? "Quoted lots only" : "Since you bought"}
              tone={pnlTone(view.book.vsCostAbs)}
            />
            <Stat
              label="Vs yesterday"
              value={
                view.book.dayPnl == null
                  ? "—"
                  : `${signedMoney(view.book.dayPnl)} · ${formatPerf(view.book.dayPct)}`
              }
              tone={pnlTone(view.book.dayPnl)}
            />
            <Stat
              label="Vs 2 sessions ago"
              value={
                view.book.priorPnl == null
                  ? "—"
                  : `${signedMoney(view.book.priorPnl)} · ${formatPerf(view.book.priorPct)}`
              }
              tone={pnlTone(view.book.priorPnl)}
            />
            <Stat
              label="Need a decision"
              value={String(view.book.decisionCount)}
              tone="text-amber-300"
            />
          </div>
          <p className="text-sm leading-relaxed text-zinc-300">
            {view.book.narrative}
          </p>
          {view.book.empty ? (
            <p className="text-sm text-zinc-600">
              Buy from Markets — lots you add land here the next morning.
            </p>
          ) : (
            <BookLotsTable lots={view.book.lots} />
          )}
        </section>

        <section className="space-y-3">
          <h2 className="font-title text-lg text-white">Approaching a buy</h2>
          <p className="text-sm text-zinc-500">
            Names you do not own, closest first. To buy is how far from a motor
            Buy — Class means the sleeve still needs Overweight, Name means the
            paper still needs Preferred. Money + is the only buy. … is Wait.
            × is Do not add. A 1D print like +7% is the market price, not an
            entry.
          </p>
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-xl tabular-nums text-emerald-400">
                {view.approaching.canAddCount}
              </p>
              <p className="text-[11px] text-zinc-500">Can add (+)</p>
            </div>
            <div>
              <p className="text-xl tabular-nums text-amber-300">
                {view.approaching.waitCount}
              </p>
              <p className="text-[11px] text-zinc-500">Wait (…)</p>
            </div>
            <div>
              <p className="text-xl tabular-nums text-white">
                {view.approaching.scoreJumpedCount}
              </p>
              <p className="text-[11px] text-zinc-500">Score jumped</p>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-zinc-300">
            {view.approaching.narrative}
          </p>
          {view.approaching.rows.length === 0 ? (
            <p className="text-sm text-zinc-600">
              No scored names available yet.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] text-zinc-500">
                <tr>
                  <th className="py-1.5 font-medium">Name</th>
                  <th className="py-1.5 font-medium">Money</th>
                  <th className="py-1.5 font-medium">To buy</th>
                  <th className="py-1.5 font-medium">1D</th>
                  <th className="py-1.5 font-medium">7D</th>
                  <th className="py-1.5 font-medium">Score Δ</th>
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
                    <td
                      className={`py-2 tabular-nums ${moneyTone(row.moneyLabel)}`}
                      title={row.moneyHint}
                    >
                      <span className="font-semibold">{row.moneyGlyph}</span>{" "}
                      <span className="text-[11px]">{row.moneyLabel}</span>
                    </td>
                    <td className="py-2" title={row.proximity.hint}>
                      <span className="tabular-nums text-zinc-200">
                        {row.proximity.value}
                      </span>
                      {row.proximity.axis ? (
                        <span className="ml-1 text-[10px] text-zinc-500">
                          {row.proximity.axis}
                        </span>
                      ) : null}
                    </td>
                    <td className={`py-2 tabular-nums ${perfClass(row.perf1dPct)}`}>
                      {formatPerf(row.perf1dPct)}
                    </td>
                    <td className={`py-2 tabular-nums ${perfClass(row.perf7dPct)}`}>
                      {formatPerf(row.perf7dPct)}
                    </td>
                    <td className="py-2 tabular-nums text-zinc-400">
                      {scoreDelta(row.scoreDelta)}
                      <span className="ml-1 text-[10px] text-zinc-600">
                        {formatScore(row.score)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <p className="text-[10px] text-zinc-600">
        Educational use only — not investment advice. Trend (↑ ● ↓) is the
        class direction. Money (+ … ×) is whether to add new cash. 1D / 7D
        are price. Weekday email, if allowed, reprints these two chapters
        — turn it on in Profile.
      </p>
    </div>
  );
}
