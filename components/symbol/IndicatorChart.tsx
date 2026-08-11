"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  ColorType,
  createChart,
  LineSeries,
  type IChartApi,
  type Time,
} from "lightweight-charts";
import type { IndicatorSeries } from "@/lib/market/technical-indicators";
import { indicatorPrimaryColor } from "@/lib/market/technical-indicators";

export type IndicatorChartBar = { date: string; value: number };

function toLineData(
  bars: IndicatorChartBar[],
  values: Array<number | null>,
): Array<{ time: Time; value: number }> {
  const out: Array<{ time: Time; value: number }> = [];
  const length = Math.min(bars.length, values.length);
  for (let i = 0; i < length; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) continue;
    out.push({ time: bars[i]!.date as Time, value: v });
  }
  return out;
}

/**
 * One indicator, plotted over the same window as the price chart.
 *
 * Moving averages are drawn against price (the distance between the two is the
 * signal); oscillators get their own scale with their overbought/oversold levels
 * marked, since an absolute value like RSI 63 means nothing without them.
 */
export function IndicatorChart({
  series,
  bars,
  height = 180,
}: {
  series: IndicatorSeries;
  bars: IndicatorChartBar[];
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const overlayPrice = series.pane === "price";

  const legend = useMemo(() => {
    const items = [{ name: series.name, color: indicatorPrimaryColor() }];
    for (const line of series.lines) items.push({ name: line.name, color: line.color });
    if (overlayPrice) items.push({ name: "Preço", color: "#34d399" });
    return items;
  }, [series, overlayPrice]);

  useEffect(() => {
    if (!containerRef.current || bars.length < 2) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#000000" },
        textColor: "#a1a1aa",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "#131316" },
        horzLines: { color: "#131316" },
      },
      rightPriceScale: { borderColor: "#27272a" },
      timeScale: { borderColor: "#27272a", visible: true },
      crosshair: {
        vertLine: { color: "#52525b" },
        horzLine: { color: "#52525b" },
      },
      width: containerRef.current.clientWidth,
      height,
    });

    if (overlayPrice) {
      const price = chart.addSeries(LineSeries, {
        color: "#34d399",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      price.setData(
        bars.map((b) => ({ time: b.date as Time, value: b.value })),
      );
    }

    const main = chart.addSeries(LineSeries, {
      color: indicatorPrimaryColor(),
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      priceFormat: { type: "price", precision: series.decimals, minMove: 0.01 },
    });
    main.setData(toLineData(bars, series.values));

    for (const level of series.levels) {
      main.createPriceLine({
        price: level.value,
        color: level.kind === "zero" ? "#52525b" : "#71717a",
        lineWidth: 1,
        lineStyle: level.kind === "zero" ? 0 : 2,
        axisLabelVisible: true,
        title: level.label ?? "",
      });
    }

    for (const line of series.lines) {
      const extra = chart.addSeries(LineSeries, {
        color: line.color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      extra.setData(toLineData(bars, line.values));
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
    };
  }, [bars, series, height, overlayPrice]);

  if (bars.length < 2) {
    return (
      <div className="flex h-40 items-center justify-center rounded border border-zinc-800 bg-black text-xs text-zinc-500">
        Histórico insuficiente para plotar {series.name}.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div ref={containerRef} className="w-full rounded border border-zinc-800 bg-black" />
      <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-zinc-600">
        {legend.map((item) => (
          <span key={item.name}>
            <span style={{ color: item.color }}>━</span> {item.name}
          </span>
        ))}
      </p>
    </div>
  );
}
