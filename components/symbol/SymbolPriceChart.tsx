"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AreaSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import type { PerfHorizonId } from "@/lib/market/perf-horizons";
import {
  PERF_HORIZON_LABELS,
  sliceBarsForHorizon,
} from "@/lib/market/perf-horizons";
import {
  bollingerBands,
  bollingerCompressionLabel,
  smaSeries,
  type ChartBar,
} from "@/lib/market/chart-overlays";

const PERIODS: PerfHorizonId[] = ["1d", "5d", "15d", "1m", "2y"];

type LayerState = {
  volume: boolean;
  ma: boolean;
  bollinger: boolean;
};

const LAYER_STORAGE_KEY = "fa.chart.layers";
const DEFAULT_LAYERS: LayerState = { volume: true, ma: false, bollinger: false };

function loadLayers(): LayerState {
  if (typeof window === "undefined") return DEFAULT_LAYERS;
  try {
    const raw = sessionStorage.getItem(LAYER_STORAGE_KEY);
    if (!raw) return DEFAULT_LAYERS;
    const parsed = JSON.parse(raw) as Partial<LayerState>;
    return {
      volume: parsed.volume ?? DEFAULT_LAYERS.volume,
      ma: parsed.ma ?? DEFAULT_LAYERS.ma,
      bollinger: parsed.bollinger ?? DEFAULT_LAYERS.bollinger,
    };
  } catch {
    return DEFAULT_LAYERS;
  }
}

function toLineData(
  bars: ChartBar[],
  values: (number | null)[],
): Array<{ time: Time; value: number }> {
  const out: Array<{ time: Time; value: number }> = [];
  for (let i = 0; i < bars.length; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) continue;
    out.push({ time: bars[i]!.date as Time, value: v });
  }
  return out;
}

export type ChartPriceLine = {
  price: number;
  title: string;
  color: string;
  /** 0 = solid, 2 = dashed (lightweight-charts LineStyle). */
  style?: 0 | 2;
};

export function SymbolPriceChart({
  bars,
  previousClose,
  horizon,
  onHorizonChange,
  priceLines,
}: {
  bars: ChartBar[];
  previousClose?: number | null;
  horizon?: PerfHorizonId;
  onHorizonChange?: (h: PerfHorizonId) => void;
  priceLines?: ChartPriceLine[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [internalHorizon, setInternalHorizon] = useState<PerfHorizonId>("1m");
  const [layers, setLayers] = useState<LayerState>(() =>
    typeof window === "undefined" ? DEFAULT_LAYERS : loadLayers(),
  );
  const activeHorizon = horizon ?? internalHorizon;

  const setHorizon = (h: PerfHorizonId) => {
    if (onHorizonChange) onHorizonChange(h);
    else setInternalHorizon(h);
  };

  const toggleLayer = (key: keyof LayerState) => {
    setLayers((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        sessionStorage.setItem(LAYER_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const windowBars = useMemo(
    () => sliceBarsForHorizon(bars, activeHorizon),
    [bars, activeHorizon],
  );

  const closes = useMemo(() => windowBars.map((b) => b.value), [windowBars]);
  const compression = useMemo(
    () => (layers.bollinger ? bollingerCompressionLabel(closes) : null),
    [closes, layers.bollinger],
  );

  useEffect(() => {
    if (!containerRef.current || windowBars.length < 2) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#000000" },
        textColor: "#a1a1aa",
      },
      grid: {
        vertLines: { color: "#18181b" },
        horzLines: { color: "#18181b" },
      },
      rightPriceScale: { borderColor: "#27272a" },
      timeScale: { borderColor: "#27272a" },
      crosshair: {
        vertLine: { color: "#52525b" },
        horzLine: { color: "#52525b" },
      },
      width: containerRef.current.clientWidth,
      height: layers.volume ? 360 : 320,
    });

    const priceSeries = chart.addSeries(AreaSeries, {
      lineColor: "#34d399",
      topColor: "rgba(52, 211, 153, 0.35)",
      bottomColor: "rgba(52, 211, 153, 0.02)",
      lineWidth: 2,
    });

    priceSeries.setData(
      windowBars.map((b) => ({
        time: b.date as Time,
        value: b.value,
      })),
    );

    if (previousClose != null && Number.isFinite(previousClose)) {
      priceSeries.createPriceLine({
        price: previousClose,
        color: "#71717a",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "Prev close",
      });
    }

    for (const line of priceLines ?? []) {
      if (!Number.isFinite(line.price)) continue;
      priceSeries.createPriceLine({
        price: line.price,
        color: line.color,
        lineWidth: 1,
        lineStyle: line.style ?? 2,
        axisLabelVisible: true,
        title: line.title,
      });
    }

    const seriesToClean: ISeriesApi<"Line" | "Histogram" | "Area">[] = [priceSeries];

    if (layers.ma) {
      const sma20 = smaSeries(closes, 20);
      const sma50 = smaSeries(closes, 50);
      const ma20 = chart.addSeries(LineSeries, {
        color: "#38bdf8",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      const ma50 = chart.addSeries(LineSeries, {
        color: "#f59e0b",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      ma20.setData(toLineData(windowBars, sma20));
      ma50.setData(toLineData(windowBars, sma50));
      seriesToClean.push(ma20, ma50);
    }

    if (layers.bollinger) {
      const bb = bollingerBands(closes, 20, 2);
      const upper = chart.addSeries(LineSeries, {
        color: "rgba(167, 139, 250, 0.7)",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        lineStyle: 2,
      });
      const mid = chart.addSeries(LineSeries, {
        color: "rgba(167, 139, 250, 0.45)",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      const lower = chart.addSeries(LineSeries, {
        color: "rgba(167, 139, 250, 0.7)",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        lineStyle: 2,
      });
      upper.setData(toLineData(windowBars, bb.upper));
      mid.setData(toLineData(windowBars, bb.mid));
      lower.setData(toLineData(windowBars, bb.lower));
      seriesToClean.push(upper, mid, lower);
    }

    if (layers.volume) {
      chart.priceScale("volume").applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });
      chart.priceScale("right").applyOptions({
        scaleMargins: { top: 0.05, bottom: 0.22 },
      });

      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
      });

      const avg =
        windowBars.reduce((a, b) => a + (b.volume ?? 0), 0) /
        Math.max(1, windowBars.filter((b) => (b.volume ?? 0) > 0).length);

      volumeSeries.setData(
        windowBars.map((b) => {
          const vol = b.volume ?? 0;
          return {
            time: b.date as Time,
            value: vol,
            color:
              vol >= avg
                ? "rgba(52, 211, 153, 0.45)"
                : "rgba(113, 113, 122, 0.35)",
          };
        }),
      );
      seriesToClean.push(volumeSeries);
    }

    chart.timeScale().fitContent();
    chartRef.current = chart;

    const onResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
      chartRef.current = null;
      void seriesToClean;
    };
  }, [windowBars, previousClose, layers, closes, priceLines]);

  if (bars.length < 2) {
    return (
      <div className="flex h-80 items-center justify-center rounded-lg border border-zinc-800 bg-black text-sm text-zinc-500">
        Histórico de preços indisponível.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-md border border-zinc-800 bg-zinc-950 p-0.5">
          {PERIODS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setHorizon(id)}
              className={`rounded px-2.5 py-1 text-[11px] transition-colors ${
                activeHorizon === id
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {PERF_HORIZON_LABELS[id]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {(
            [
              ["volume", "Volume"],
              ["ma", "MM"],
              ["bollinger", "Bollinger"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleLayer(key)}
              className={`rounded border px-2 py-1 text-[11px] transition-colors ${
                layers[key]
                  ? "border-zinc-500 bg-zinc-800 text-zinc-200"
                  : "border-zinc-800 bg-transparent text-zinc-500 hover:border-zinc-700"
              }`}
              title={`Toggle ${label}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        {compression ? (
          <span className="absolute right-2 top-2 z-10 rounded border border-zinc-700 bg-zinc-950/90 px-2 py-0.5 text-[10px] text-zinc-400">
            Volatilidade {compression}
          </span>
        ) : null}
        <div
          ref={containerRef}
          className="w-full rounded-lg border border-zinc-800 bg-black"
        />
      </div>

      {layers.ma ? (
        <p className="text-[10px] text-zinc-600">
          <span className="text-sky-400">━</span> MM20 ·{" "}
          <span className="text-amber-400">━</span> MM50
        </p>
      ) : null}
    </div>
  );
}
