"use client";

import { useEffect, useRef } from "react";
import {
  ColorType,
  createChart,
  LineSeries,
} from "lightweight-charts";
import type { MotorScoreHistoryPoint } from "@/lib/motor/snapshot-types";

export function SymbolScoreHistoryChart({
  title,
  points,
  color = "#38bdf8",
}: {
  title: string;
  points: MotorScoreHistoryPoint[];
  color?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || points.length < 2) return;

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
      width: containerRef.current.clientWidth,
      height: 200,
    });

    const series = chart.addSeries(LineSeries, {
      color,
      lineWidth: 2,
    });

    series.setData(
      points.map((p) => ({
        time: p.date,
        value: p.score,
      })),
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
  }, [points, color]);

  if (points.length < 2) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-500">
        {title}: histórico insuficiente (aguarde mais Motor Daily runs).
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-zinc-400">{title}</h4>
      <div ref={containerRef} className="w-full rounded-lg border border-zinc-800 bg-black" />
    </div>
  );
}
