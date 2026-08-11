"use client";

export type TrendDirection = "up" | "down" | "flat";

const ARROW: Record<TrendDirection, string> = {
  up: "▲",
  down: "▼",
  flat: "→",
};

const ARROW_CLASS: Record<TrendDirection, string> = {
  up: "text-emerald-400",
  down: "text-red-400",
  flat: "text-zinc-500",
};

function Sparkline({ data, width = 56, height = 20 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) {
    return <span className="inline-block h-5 w-14 rounded bg-zinc-900" />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);

  const points = data
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return `${x},${y}`;
    })
    .join(" ");

  const last = data[data.length - 1]!;
  const prev = data[data.length - 2]!;
  const stroke = last >= prev ? "#4ade80" : last < prev ? "#f87171" : "#71717a";

  return (
    <svg width={width} height={height} className="inline-block" aria-hidden>
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}

export function IndicatorTrend({
  value,
  sparklineData,
  delta,
  deltaPct,
  direction,
  compact = false,
}: {
  value?: string | number | null;
  sparklineData: number[];
  delta?: number | string | null;
  deltaPct?: number | null;
  direction: TrendDirection;
  compact?: boolean;
}) {
  const deltaStr =
    delta != null
      ? typeof delta === "number"
        ? (delta >= 0 ? "+" : "") + delta.toFixed(2)
        : delta
      : null;
  const pctStr =
    deltaPct != null && Number.isFinite(deltaPct)
      ? ` (${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%)`
      : "";

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Sparkline data={sparklineData} />
        <span className={`text-xs ${ARROW_CLASS[direction]}`}>{ARROW[direction]}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {value != null ? (
        <span className="tabular-nums text-zinc-300">{value}</span>
      ) : null}
      <Sparkline data={sparklineData} />
      <span className={`${ARROW_CLASS[direction]}`}>
        {ARROW[direction]}
        {deltaStr ? (
          <span className="ml-1 tabular-nums text-zinc-400">
            {deltaStr}
            {pctStr}
          </span>
        ) : null}
      </span>
    </div>
  );
}
