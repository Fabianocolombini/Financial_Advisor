import type { MotorEwmaVolSnapshot, MotorModelsSnapshot } from "@/lib/motor/snapshot-types";

export function SymbolModelsPanel({ models }: { models?: MotorModelsSnapshot }) {
  if (!models?.regime && !models?.ewma_vol) {
    return (
      <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-500">
        Global models (regime / EWMA vol) are not available in the snapshot.
      </section>
    );
  }

  const regime = models.regime;
  const ewma = models.ewma_vol;

  return (
    <section className="space-y-4 rounded-lg border border-zinc-800 bg-black p-4">
      <h3 className="text-sm font-medium text-white">Modelos globais (motor)</h3>
      {regime ? (
        <div className="space-y-2">
          <h4 className="text-xs text-zinc-400">Regime risk probability</h4>
          <p className="text-2xl font-medium text-white">
            {(regime.regime_risk_probability * 100).toFixed(1)}%
          </p>
          <p className="text-[11px] text-zinc-500">
            {regime.calibrated
              ? `Calibrated (${regime.n_samples ?? "?"} samples)`
              : regime.calibration_warning ?? "Not calibrated"}
          </p>
          {regime.features?.length ? (
            <ul className="text-[11px] text-zinc-500">
              {regime.features.map((f) => (
                <li key={f.id}>
                  {f.id}: {f.value.toFixed(3)} × {f.coefficient.toFixed(3)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {ewma ? (
        <div className="space-y-2">
          <h4 className="text-xs text-zinc-400">EWMA vol (annualized)</h4>
          <ul className="text-sm text-zinc-300">
            {(Object.entries(ewma) as [string, MotorEwmaVolSnapshot[string]][]).map(
              ([key, row]) => (
                <li key={key}>
                  {row.ticker}: {row.ewma_vol_annualized.toFixed(4)} (λ={row.lambda})
                </li>
              ),
            )}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
