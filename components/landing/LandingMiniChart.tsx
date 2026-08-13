"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AreaSeries,
  ColorType,
  createChart,
  HistogramSeries,
  type Time,
} from "lightweight-charts";
import type { PerfHorizonId } from "@/lib/market/perf-horizons";
import { sliceBarsForHorizon } from "@/lib/market/perf-horizons";
import type { ChartBar } from "@/lib/market/chart-overlays";

const CARD_HORIZONS = ["1d", "5d", "1m"] as const;
const LABELS: Record<(typeof CARD_HORIZONS)[number], string> = {
  "1d": "1D",
  "5d": "5D",
  "1m": "1M",
};

type ChartPayload = {
  bars: ChartBar[];
};

/**
 * Compact Overview-style price+volume chart for a class proxy (the flagship ETF).
 */
export function LandingMiniChart({ symbol }: { symbol: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [bars, setBars] = useState<ChartBar[] | null>(null);
  const [horizon, setHorizon] = useState<PerfHorizonId>("1m");
  const [error, setError] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setInView(true);
      },
      { rootMargin: "280px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;
    let cancelled = false;
    fetch(`/api/market/${encodeURIComponent(symbol)}/chart`)
      .then(async (res) => {
        if (!res.ok) throw new Error("chart failed");
        return (await res.json()) as ChartPayload;
      })
      .then((json) => {
        if (cancelled) return;
        setError(false);
        setBars(json.bars ?? []);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [inView, symbol]);

  const windowBars = useMemo(
    () => (bars ? sliceBarsForHorizon(bars, horizon) : []),
    [bars, horizon],
  );

  useEffect(() => {
    if (!containerRef.current || windowBars.length < 2) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#000000" },
        textColor: "#71717a",
        fontSize: 9,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "#18181b" },
        horzLines: { color: "#18181b" },
      },
      rightPriceScale: {
        borderColor: "#27272a",
        scaleMargins: { top: 0.08, bottom: 0.22 },
      },
      timeScale: {
        borderColor: "#27272a",
        visible: true,
        timeVisible: false,
      },
      crosshair: {
        vertLine: { color: "#52525b", width: 1, style: 3 },
        horzLine: { visible: false },
      },
      handleScroll: false,
      handleScale: false,
      width: containerRef.current.clientWidth,
      height: 132,
    });

    const priceSeries = chart.addSeries(AreaSeries, {
      lineColor: "#34d399",
      topColor: "rgba(52, 211, 153, 0.35)",
      bottomColor: "rgba(52, 211, 153, 0.02)",
      lineWidth: 2,
      lastValueVisible: true,
      priceLineVisible: false,
    });
    priceSeries.setData(
      windowBars.map((b) => ({ time: b.date as Time, value: b.value })),
    );

    if (windowBars.length >= 2) {
      const prev = windowBars[windowBars.length - 2]!.value;
      priceSeries.createPriceLine({
        price: prev,
        color: "#71717a",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "Prev",
      });
    }

    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    });
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      lastValueVisible: false,
      priceLineVisible: false,
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
            vol >= avg ? "rgba(52, 211, 153, 0.45)" : "rgba(113, 113, 122, 0.35)",
        };
      }),
    );

    chart.timeScale().fitContent();
    const onResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
    };
  }, [windowBars]);

  return (
    <div ref={wrapRef} className="mt-3">
      <div className="mb-1 flex gap-0.5" role="group" aria-label={`${symbol} chart range`}>
        {CARD_HORIZONS.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={horizon === id}
            onClick={() => setHorizon(id)}
            className={`rounded px-1.5 py-0.5 text-[10px] ${
              horizon === id
                ? "bg-zinc-800 text-white"
                : "text-zinc-600 hover:text-zinc-300"
            }`}
          >
            {LABELS[id]}
          </button>
        ))}
      </div>
      {error || (bars && bars.length < 2) ? (
        <p className="flex h-[132px] items-center justify-center text-[11px] text-zinc-600">
          Chart unavailable
        </p>
      ) : (
        <div
          ref={containerRef}
          className="h-[132px] w-full overflow-hidden"
          aria-label={`${symbol} price chart`}
        />
      )}
    </div>
  );
}
