"use client";

import { useEffect, useRef, useState } from "react";
import {
  ColorType,
  createChart,
  LineSeries,
} from "lightweight-charts";
import { fredSeriesForIndicator } from "@/lib/motor/indicator-fred-map";

export function IndicatorFredChart({
  indicatorId,
  indicatorName,
}: {
  indicatorId: string;
  indicatorName: string;
}) {
  const seriesId = fredSeriesForIndicator(indicatorId);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!seriesId || !containerRef.current) return;

    let chart: ReturnType<typeof createChart> | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const r = await fetch(`/api/market/fred/${encodeURIComponent(seriesId)}?years=5`);
        const json = await r.json();
        if (cancelled) return;
        if (json.error) throw new Error(json.error);
        const obs = json.observations as Array<{ date: string; value: number }>;
        if (!containerRef.current || obs.length < 2) {
          setError("Série curta ou vazia");
          setLoading(false);
          return;
        }
        chart = createChart(containerRef.current, {
          layout: {
            background: { type: ColorType.Solid, color: "#000000" },
            textColor: "#a1a1aa",
            attributionLogo: false,
          },
          grid: {
            vertLines: { color: "#18181b" },
            horzLines: { color: "#18181b" },
          },
          width: containerRef.current.clientWidth,
          height: 160,
        });
        const line = chart.addSeries(LineSeries, { color: "#a78bfa", lineWidth: 2 });
        line.setData(obs.map((o) => ({ time: o.date, value: o.value })));
        chart.timeScale().fitContent();
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (chart) chart.remove();
    };
  }, [seriesId, indicatorId]);

  if (!seriesId) {
    return (
      <p className="text-[11px] text-zinc-600">
        {indicatorName}: histórico FRED não mapeado (fonte external/scraper — valor atual no snapshot).
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-[11px] text-zinc-500">
        {indicatorName} · FRED {seriesId}
      </p>
      {loading ? <p className="text-xs text-zinc-500">Carregando histórico…</p> : null}
      {error ? <p className="text-xs text-amber-400">{error}</p> : null}
      <div ref={containerRef} className="w-full rounded border border-zinc-800 bg-black" />
    </div>
  );
}
