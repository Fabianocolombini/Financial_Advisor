"use client";

import { useEffect, useRef } from "react";
import {
  AreaSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";

type Bar = { date: string; value: number };

export function SymbolPriceChart({
  bars,
  previousClose,
}: {
  bars: Bar[];
  previousClose?: number | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  useEffect(() => {
    if (!containerRef.current || bars.length < 2) return;

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
      crosshair: { vertLine: { color: "#52525b" }, horzLine: { color: "#52525b" } },
      width: containerRef.current.clientWidth,
      height: 320,
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: "#34d399",
      topColor: "rgba(52, 211, 153, 0.35)",
      bottomColor: "rgba(52, 211, 153, 0.02)",
      lineWidth: 2,
    });

    const data = bars.map((b) => ({
      time: b.date as string,
      value: b.value,
    }));
    series.setData(data);

    if (previousClose != null && Number.isFinite(previousClose)) {
      series.createPriceLine({
        price: previousClose,
        color: "#71717a",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "Prev close",
      });
    }

    chart.timeScale().fitContent();
    chartRef.current = chart;
    seriesRef.current = series;

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
      seriesRef.current = null;
    };
  }, [bars, previousClose]);

  if (bars.length < 2) {
    return (
      <div className="flex h-80 items-center justify-center rounded-lg border border-zinc-800 bg-black text-sm text-zinc-500">
        Histórico de preços indisponível.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full rounded-lg border border-zinc-800 bg-black"
    />
  );
}
