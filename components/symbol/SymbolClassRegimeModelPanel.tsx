import type { MotorClassRegimeModelSnapshot } from "@/lib/motor/snapshot-types";

const CLASS_META: Record<
  string,
  { title: string; scoreLabel: string; securityNote: string }
> = {
  cash_equivalents: {
    title: "Modelo Cash — duas camadas",
    scoreLabel: "CashRegimeScore",
    securityNote:
      "SecurityScore: percentis cross-sectional (liquidez, vol, |Δ50|). Sem RSI.",
  },
  fi_treasury: {
    title: "Modelo Treasuries — duas camadas",
    scoreLabel: "TreasuryRegimeScore",
    securityNote:
      "SecurityScore: tendência + RSI + volume − COT crowding. Rankeia ponto da curva.",
  },
  fi_ig: {
    title: "Modelo IG Bonds — duas camadas",
    scoreLabel: "IGRegimeScore",
    securityNote:
      "SecurityScore: tendência + RSI + volume + duration fit vs term premium.",
  },
  fi_hy: {
    title: "Modelo High Yield — duas camadas",
    scoreLabel: "HYRegimeScore",
    securityNote:
      "SecurityScore: tendência + RSI + volume − vol penalty (σ20). Sem fed cut prob.",
  },
  fi_tips: {
    title: "Modelo TIPS — duas camadas",
    scoreLabel: "TIPSRegimeScore",
    securityNote:
      "SecurityScore: tendência + RSI + volume + duration fit vs yield real (RY_pct).",
  },
  fi_preferred: {
    title: "Modelo Preferred — duas camadas",
    scoreLabel: "PreferredRegimeScore",
    securityNote:
      "SecurityScore: tendência + RSI + yield − vol penalty (σ20). Sem volume.",
  },
  us_equity: {
    title: "Modelo US Equity — duas camadas",
    scoreLabel: "USEquityRegimeScore",
    securityNote:
      "SecurityScore: tendência + RSI + volume − vol penalty (σ20).",
  },
  intl_equity: {
    title: "Modelo International — duas camadas",
    scoreLabel: "IntlEquityRegimeScore",
    securityNote:
      "SecurityScore: tendência + RSI + vol inversa + hedge fit (UUP).",
  },
  em_equity: {
    title: "Modelo Emerging Markets — duas camadas",
    scoreLabel: "EMEquityRegimeScore",
    securityNote:
      "SecurityScore: tendência + RSI + volume + china fit (FXI beta).",
  },
  real_estate: {
    title: "Modelo REITs — duas camadas",
    scoreLabel: "REITsRegimeScore",
    securityNote:
      "SecurityScore: tendência + yield + volume − vol (sem RSI).",
  },
  commodities_precious: {
    title: "Modelo Metais Preciosos — duas camadas",
    scoreLabel: "PreciousRegimeScore",
    securityNote:
      "SecurityScore: tendência + RSI + volume − expense ratio.",
  },
  commodities_energy: {
    title: "Modelo Energia — duas camadas",
    scoreLabel: "EnergyRegimeScore",
    securityNote:
      "SecurityScore: tendência + RSI + volume + beta fit vs USO.",
  },
  energy_mlp: {
    title: "Modelo MLP — duas camadas",
    scoreLabel: "MLPRegimeScore",
    securityNote:
      "SecurityScore: tendência + yield + volume − vol penalty.",
  },
  healthcare_biotech: {
    title: "Modelo Biotech — duas camadas",
    scoreLabel: "BiotechRegimeScore",
    securityNote:
      "SecurityScore: tendência + RSI + volume + catalyst density (FDA).",
  },
  alt_bdc: {
    title: "Modelo BDC — duas camadas",
    scoreLabel: "BDCRegimeScore",
    securityNote:
      "SecurityScore: tendência + NAV discount + yield − vol penalty.",
  },
  alt_infrastructure: {
    title: "Modelo Infraestrutura — duas camadas",
    scoreLabel: "InfraRegimeScore",
    securityNote:
      "SecurityScore: tendência + yield + vol inversa + volume.",
  },
  currencies: {
    title: "Modelo FX — ritmo de conversão",
    scoreLabel: "ConversionPaceScore",
    securityNote:
      "SecurityScore: custo efetivo + liquidez + adequação fiscal (carry).",
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
        <strong className="text-zinc-300">Modelo 1 (regime)</strong> define{" "}
        {regimeModel.outputType === "pace"
          ? "o ritmo de conversão FX"
          : "quanto alocar no sleeve"}
        . <strong className="text-zinc-300">Modelo 2 (security)</strong> rankeia qual
        instrumento — scores não se misturam.
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
            {regimeModel.outputType === "pace" ? "Ritmo conversão" : "Ação sleeve"}
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
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">Ação calculada</p>
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
