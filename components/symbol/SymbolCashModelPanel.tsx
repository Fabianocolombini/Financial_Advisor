import type { MotorClassRegimeModelSnapshot } from "@/lib/motor/snapshot-types";

export function SymbolCashModelPanel({
  regimeModel,
  classId,
}: {
  regimeModel?: MotorClassRegimeModelSnapshot | null;
  classId: string;
}) {
  if (classId !== "cash_equivalents" || !regimeModel) {
    return null;
  }

  return (
    <section className="space-y-3 rounded-lg border border-sky-900/50 bg-sky-950/20 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium text-sky-100">Modelo Cash — duas camadas</h3>
        {regimeModel.calibrated === false ? (
          <span className="rounded-full bg-amber-950/60 px-2 py-0.5 text-[10px] text-amber-300 ring-1 ring-amber-800/50">
            calibrated: false
          </span>
        ) : null}
      </div>
      <p className="text-xs text-zinc-400">
        <strong className="text-zinc-300">Modelo 1 (regime)</strong> define quanto alocar no
        sleeve. <strong className="text-zinc-300">Modelo 2 (security)</strong> rankeia qual
        instrumento dentro do cash — scores não se misturam.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded border border-zinc-800 bg-black/40 p-3">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">CashRegimeScore</p>
          <p className="text-lg font-semibold text-white">
            {regimeModel.score != null ? regimeModel.score.toFixed(3) : "—"}
          </p>
        </div>
        <div className="rounded border border-zinc-800 bg-black/40 p-3">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">Ação sleeve</p>
          <p className="text-lg font-semibold text-emerald-300">{regimeModel.action ?? "—"}</p>
          {regimeModel.stressFlag ? (
            <p className="text-[10px] text-amber-400">Stress override (piso Hold)</p>
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
