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
        <strong className="text-zinc-300">Modelo 1 (regime)</strong> define quanto alocar no
        sleeve. <strong className="text-zinc-300">Modelo 2 (security)</strong> rankeia qual
        instrumento / ponto da curva — scores não se misturam.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded border border-zinc-800 bg-black/40 p-3">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">{meta.scoreLabel}</p>
          <p className="text-lg font-semibold text-white">
            {regimeModel.score != null ? regimeModel.score.toFixed(3) : "—"}
          </p>
        </div>
        <div className="rounded border border-zinc-800 bg-black/40 p-3">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">Ação sleeve</p>
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
          {regimeModel.stressFlag &&
          !regimeModel.flightToQualityFlag &&
          !regimeModel.inflationShockFlag &&
          !regimeModel.creditEventFlag &&
          !regimeModel.hyStressFlag ? (
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
