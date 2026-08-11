"use client";

import {
  gaugeBandForValue,
  needleDegreesForScale,
  scaleFraction,
  type GaugeScale,
} from "@/lib/motor/gauge-zones";
import { InfoTooltip } from "./InfoTooltip";

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
  scale,
  value,
  confidence,
  caption,
  summary,
}: {
  scale: GaugeScale;
  value: number | null;
  confidence: number | null;
  /** Extra context line under the reading (e.g. entry timing). */
  caption?: string;
  summary?: string;
}) {
  const hasValue = value != null && Number.isFinite(value);
  const safeValue = hasValue ? value! : (scale.domainMin + scale.domainMax) / 2;
  const band = gaugeBandForValue(scale, safeValue);
  const needleDeg = needleDegreesForScale(scale, safeValue);

  const confidenceText =
    confidence != null && Number.isFinite(confidence)
      ? `${confidence.toFixed(1)}/10`
      : "—";

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex items-center gap-1.5">
        <h3 className="text-sm font-medium text-white">{scale.title}</h3>
        <InfoTooltip term="technical_rating" />
      </div>
      <p className="mt-1 text-[11px] text-zinc-600">{scale.caption}</p>

      <div className="mt-4 flex flex-col items-center">
        <svg viewBox="0 0 240 130" className="h-32 w-full max-w-xs" aria-hidden>
          {scale.bands.map((b) => {
            const start = 180 + scaleFraction(scale, b.min) * 180;
            const end = 180 + scaleFraction(scale, b.max) * 180;
            return (
              <path
                key={b.label}
                d={arcPath(120, 120, 88, start, end)}
                fill="none"
                stroke={b.color}
                strokeWidth={14}
                strokeLinecap="butt"
              />
            );
          })}
          {hasValue ? (
            <g transform={`rotate(${needleDeg} 120 120)`}>
              <line x1="120" y1="120" x2="120" y2="42" stroke="#fafafa" strokeWidth="2.5" />
              <circle cx="120" cy="120" r="5" fill="#fafafa" />
            </g>
          ) : (
            <circle cx="120" cy="120" r="5" fill="#52525b" />
          )}
        </svg>

        <p className={`text-xl font-semibold ${hasValue ? band.textClass : "text-zinc-500"}`}>
          {hasValue ? band.label : "Sem dado do motor"}
        </p>
        <p className="mt-1 text-center text-xs text-zinc-400">
          Confiabilidade dos dados: {confidenceText}
          <span className="text-zinc-600"> (qualidade da informação, não probabilidade de acerto)</span>
        </p>
        {caption ? (
          <p className="mt-1 text-center text-xs text-zinc-300">{caption}</p>
        ) : null}
        {summary ? (
          <p className="mt-2 max-w-md text-center text-xs text-zinc-500">{summary}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap justify-center gap-2 text-[10px] text-zinc-600">
          {scale.bands.map((b) => (
            <span key={b.label} className={b.label === band.label ? "text-zinc-400" : undefined}>
              {b.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
