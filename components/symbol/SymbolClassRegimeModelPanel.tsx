import type { MotorClassRegimeModelSnapshot } from "@/lib/motor/snapshot-types";

const CLASS_META: Record<
  string,
  { title: string; scoreLabel: string; securityNote: string }
> = {
  cash_equivalents: {
    title: "Cash model — two layers",
    scoreLabel: "CashRegimeScore",
    securityNote:
      "SecurityScore: 50% traded volume + 35% 20-day vol (lower is better) + 15% |MA50| z-score (smaller gap is better). No RSI.",
  },
  fi_treasury: {
    title: "Treasuries model — two layers",
    scoreLabel: "TreasuryRegimeScore",
    securityNote:
      "SecurityScore: duration-adjusted trend and RSI (35/25) + traded volume (20) + inverted COT hold-last (20). Ranks the point on the curve.",
  },
  fi_ig: {
    title: "IG Bonds model — two layers",
    scoreLabel: "IGRegimeScore",
    securityNote:
      "SecurityScore: trend + RSI + volume + duration fit vs term premium.",
  },
  fi_hy: {
    title: "High Yield model — two layers",
    scoreLabel: "HYRegimeScore",
    securityNote:
      "SecurityScore: trend + RSI + volume − vol penalty (σ20). No fed cut prob.",
  },
  fi_tips: {
    title: "TIPS model — two layers",
    scoreLabel: "TIPSRegimeScore",
    securityNote:
      "SecurityScore: trend + RSI + volume + duration fit vs real yield (RY_pct).",
  },
  fi_preferred: {
    title: "Preferred model — two layers",
    scoreLabel: "PreferredRegimeScore",
    securityNote:
      "SecurityScore: trend + RSI + yield − vol penalty (σ20). No volume.",
  },
  us_equity: {
    title: "US Equity model — two layers",
    scoreLabel: "USEquityRegimeScore",
    securityNote:
      "SecurityScore: trend + RSI + volume − vol penalty (σ20).",
  },
  intl_equity: {
    title: "International model — two layers",
    scoreLabel: "IntlEquityRegimeScore",
    securityNote:
      "SecurityScore: trend + RSI + inverse vol + hedge fit (UUP).",
  },
  em_equity: {
    title: "Emerging Markets model — two layers",
    scoreLabel: "EMEquityRegimeScore",
    securityNote:
      "SecurityScore: trend + RSI + volume + china fit (FXI beta).",
  },
  real_estate: {
    title: "REITs model — two layers",
    scoreLabel: "REITsRegimeScore",
    securityNote:
      "SecurityScore: trend + yield + volume − vol (no RSI).",
  },
  commodities_precious: {
    title: "Precious Metals model — two layers",
    scoreLabel: "PreciousRegimeScore",
    securityNote:
      "SecurityScore: trend + RSI + volume − expense ratio.",
  },
  commodities_energy: {
    title: "Energy model — two layers",
    scoreLabel: "EnergyRegimeScore",
    securityNote:
      "SecurityScore: trend + RSI + volume + beta fit vs USO.",
  },
  energy_mlp: {
    title: "MLP model — two layers",
    scoreLabel: "MLPRegimeScore",
    securityNote:
      "SecurityScore: trend + yield + volume − vol penalty.",
  },
  healthcare_biotech: {
    title: "Biotech model — two layers",
    scoreLabel: "BiotechRegimeScore",
    securityNote:
      "SecurityScore: trend + RSI + volume + catalyst density (FDA).",
  },
  alt_bdc: {
    title: "BDC model — two layers",
    scoreLabel: "BDCRegimeScore",
    securityNote:
      "SecurityScore: trend + NAV discount + yield − vol penalty.",
  },
  alt_infrastructure: {
    title: "Infrastructure model — two layers",
    scoreLabel: "InfraRegimeScore",
    securityNote:
      "SecurityScore: trend + yield + inverse vol + volume.",
  },
  currencies: {
    title: "FX model — conversion pace",
    scoreLabel: "ConversionPaceScore",
    securityNote:
      "SecurityScore: effective cost + liquidity + tax fit (carry).",
  },
};

export function SymbolClassRegimeModelPanel({
  regimeModel,
  classId,
}: {
  regimeModel?: MotorClassRegimeModelSnapshot | null;
  classId: string;
}) {
  const meta = CLASS_META[classId];
  if (!meta || !regimeModel) {
    return null;
  }

  return (
    <section
      className={`space-y-3 rounded-lg border p-4 ${
        classId === "fi_treasury"
          ? "border-violet-900/50 bg-violet-950/20"
          : classId === "fi_ig"
            ? "border-emerald-900/50 bg-emerald-950/20"
            : classId === "fi_hy"
              ? "border-orange-900/50 bg-orange-950/20"
              : classId === "fi_tips"
                ? "border-cyan-900/50 bg-cyan-950/20"
                : classId === "fi_preferred"
                  ? "border-pink-900/50 bg-pink-950/20"
                  : "border-sky-900/50 bg-sky-950/20"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3
          className={`text-sm font-medium ${
            classId === "fi_treasury"
              ? "text-violet-100"
              : classId === "fi_ig"
                ? "text-emerald-100"
                : classId === "fi_hy"
                  ? "text-orange-100"
                  : classId === "fi_tips"
                    ? "text-cyan-100"
                    : classId === "fi_preferred"
                      ? "text-pink-100"
                      : "text-sky-100"
          }`}
        >
          {meta.title}
        </h3>
        {regimeModel.calibrated === false ? (
          <span className="rounded-full bg-amber-950/60 px-2 py-0.5 text-[10px] text-amber-300 ring-1 ring-amber-800/50">
            calibrated: false
          </span>
        ) : null}
      </div>
      <p className="text-xs text-zinc-400">
        <strong className="text-zinc-300">Model 1 (regime)</strong> sets{" "}
        {regimeModel.outputType === "pace"
          ? "the FX conversion pace"
          : "how much to allocate in the sleeve"}
        . <strong className="text-zinc-300">Model 2 (security)</strong> ranks which
        instrument — scores do not mix.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded border border-zinc-800 bg-black/40 p-3">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">{meta.scoreLabel}</p>
          <p className="text-lg font-semibold text-white">
            {regimeModel.score != null ? regimeModel.score.toFixed(3) : "—"}
          </p>
        </div>
        <div className="rounded border border-zinc-800 bg-black/40 p-3">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">
            {regimeModel.outputType === "pace" ? "Conversion pace" : "Sleeve action"}
          </p>
          <p className="text-lg font-semibold text-emerald-300">{regimeModel.action ?? "—"}</p>
          {regimeModel.flightToQualityFlag ? (
            <p className="text-[10px] text-emerald-400">Flight-to-quality override</p>
          ) : null}
          {regimeModel.inflationShockFlag ? (
            <p className="text-[10px] text-red-400">Inflation-shock cap (Reduce)</p>
          ) : null}
          {regimeModel.creditEventFlag ? (
            <p className="text-[10px] text-amber-400">Credit event cap (Reduce)</p>
          ) : null}
          {regimeModel.hyStressFlag ? (
            <p className="text-[10px] text-red-400">HY stress cap (Strong Reduce)</p>
          ) : null}
          {regimeModel.tipsLiquidityFlag ? (
            <p className="text-[10px] text-amber-400">TIPS liquidity cap (Hold)</p>
          ) : null}
          {regimeModel.recessionWarningFlag ? (
            <p className="text-[10px] text-amber-400">Recession warning cap (Reduce)</p>
          ) : null}
          {regimeModel.emStressFlag ? (
            <p className="text-[10px] text-red-400">EM stress cap (Strong Reduce)</p>
          ) : null}
          {regimeModel.navStressFlag ? (
            <p className="text-[10px] text-amber-400">NAV/NA stress cap (Reduce)</p>
          ) : null}
          {regimeModel.bankStressFlag ? (
            <p className="text-[10px] text-red-400">Bank stress cap (Strong Reduce)</p>
          ) : null}
          {regimeModel.stressFlag &&
          !regimeModel.flightToQualityFlag &&
          !regimeModel.inflationShockFlag &&
          !regimeModel.creditEventFlag &&
          !regimeModel.hyStressFlag &&
          !regimeModel.tipsLiquidityFlag &&
          !regimeModel.bankStressFlag &&
          !regimeModel.recessionWarningFlag &&
          !regimeModel.emStressFlag &&
          !regimeModel.navStressFlag ? (
            <p className="text-[10px] text-amber-400">Stress override</p>
          ) : null}
        </div>
        <div className="rounded border border-zinc-800 bg-black/40 p-3">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">Calculated action</p>
          <p className="text-sm text-zinc-300">{regimeModel.actionCalculated ?? "—"}</p>
        </div>
      </div>
      {regimeModel.explanation?.length ? (
        <ul className="space-y-1 text-xs text-zinc-400">
          {regimeModel.explanation.map((line) => (
            <li key={line}>• {line.replace(/\*\*/g, "")}</li>
          ))}
        </ul>
      ) : null}
      {regimeModel.calibrationNote ? (
        <p className="text-[10px] text-zinc-500">{regimeModel.calibrationNote}</p>
      ) : null}
    </section>
  );
}
