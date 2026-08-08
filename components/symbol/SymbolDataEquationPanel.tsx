import type { ClassDataEquation } from "@/lib/motor/class-data-equation";
import { formatIndicatorValue } from "@/lib/motor/format-scores";

export function SymbolDataEquationPanel({
  equation,
  classLabel,
}: {
  equation: ClassDataEquation;
  classLabel: string;
}) {
  return (
    <section className="space-y-4 rounded-lg border border-zinc-800 bg-black p-4">
      <div>
        <h3 className="text-sm font-medium text-white">Equação de dados — {classLabel}</h3>
        <p className="mt-1 text-xs text-zinc-500">{equation.role}</p>
        <p className="mt-2 text-xs text-zinc-400">
          Cobertura do mapa de decisão:{" "}
          <span className="text-white">{equation.overallCoveragePct}%</span> dos indicadores
          gratuitos mapeados com valor no snapshot.
        </p>
      </div>
      <div className="space-y-4">
        {equation.questions.map((q) => (
          <div key={q.questionId} className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="text-xs font-medium text-zinc-300">{q.label}</h4>
              <span className="text-[10px] text-zinc-500">{q.coveragePct}% covered</span>
            </div>
            <p className="text-[11px] text-zinc-600">{q.description}</p>
            <ul className="space-y-1">
              {q.indicators.map((ind) => (
                <li
                  key={ind.id}
                  className="flex flex-wrap items-center gap-2 text-xs text-zinc-400"
                >
                  <span className="text-zinc-300">{ind.name}</span>
                  <span className="tabular-nums">
                    {formatIndicatorValue(ind.value)}
                  </span>
                  {ind.status === "proxy" ? (
                    <span className="text-[10px] text-amber-400">proxy</span>
                  ) : null}
                  {ind.status === "missing" ? (
                    <span className="text-[10px] text-red-400">missing</span>
                  ) : null}
                  {ind.proxyRationale ? (
                    <span className="text-[10px] text-zinc-600">— {ind.proxyRationale}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
