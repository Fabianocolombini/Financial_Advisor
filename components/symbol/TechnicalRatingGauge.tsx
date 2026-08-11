"use client";

import {
  GAUGE_ZONES,
  gaugeNeedleDegrees,
  gaugeZoneForValue,
  type GaugeZone,
} from "@/lib/motor/gauge-zones";
import { InfoTooltip } from "./InfoTooltip";

const ZONE_LABELS: GaugeZone[] = [
  "Strong Sell",
  "Sell",
  "Neutral",
  "Buy",
  "Strong Buy",
];

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startDeg));
  const y1 = cy + r * Math.sin(toRad(startDeg));
  const x2 = cx + r * Math.cos(toRad(endDeg));
  const y2 = cy + r * Math.sin(toRad(endDeg));
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

export function TechnicalRatingGauge({
  value,
  confidence,
  label,
  entryValidated,
  summary,
}: {
  value: number;
  confidence: number | null;
  label: string;
  entryValidated?: boolean;
  summary?: string;
}) {
  const zone = gaugeZoneForValue(value);
  const needleDeg = gaugeNeedleDegrees(value);
  const zoneStyle = GAUGE_ZONES.find((z) => z.zone === zone);

  const entryText = entryValidated ? "validada" : "não validada";
  const confidenceText =
    confidence != null && Number.isFinite(confidence)
      ? `${confidence.toFixed(1)}/10`
      : "—";

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex items-center gap-1.5">
        <h3 className="text-sm font-medium text-white">Technical Rating</h3>
        <InfoTooltip term="technical_rating" />
      </div>

      <div className="mt-4 flex flex-col items-center">
        <svg viewBox="0 0 240 130" className="h-32 w-full max-w-xs" aria-hidden>
          {GAUGE_ZONES.map((z) => {
            const start = 180 + z.min * 90;
            const end = 180 + z.max * 90;
            return (
              <path
                key={z.zone}
                d={arcPath(120, 120, 88, start, end)}
                fill="none"
                stroke={z.color}
                strokeWidth={14}
                strokeLinecap="butt"
              />
            );
          })}
          <g transform={`rotate(${needleDeg} 120 120)`}>
            <line x1="120" y1="120" x2="120" y2="42" stroke="#fafafa" strokeWidth="2.5" />
            <circle cx="120" cy="120" r="5" fill="#fafafa" />
          </g>
        </svg>

        <p className={`text-xl font-semibold ${zoneStyle?.textClass ?? "text-zinc-300"}`}>
          {zone}
        </p>
        <p className="mt-1 text-center text-xs text-zinc-400">
          <span className="text-zinc-200">Recomendação: {label}</span>
          {" · "}
          Confiança do modelo: {confidenceText}
          {" · "}
          Entrada: {entryText}
        </p>
        {summary ? (
          <p className="mt-2 max-w-md text-center text-xs text-zinc-500">{summary}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap justify-center gap-2 text-[10px] text-zinc-600">
          {ZONE_LABELS.map((l) => (
            <span key={l} className={l === zone ? "text-zinc-400" : undefined}>
              {l}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
