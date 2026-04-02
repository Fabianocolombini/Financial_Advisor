import { QI_MODEL_VERSION } from "@/lib/qi/constants";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function MercadoPage() {
  const [macro, risk, latestSectorDate, recommendation] = await Promise.all([
    prisma.qiRegimeSnapshot.findFirst({
      where: { kind: "MACRO", modelVersion: QI_MODEL_VERSION },
      orderBy: { asOfDate: "desc" },
    }),
    prisma.qiRegimeSnapshot.findFirst({
      where: { kind: "RISK", modelVersion: QI_MODEL_VERSION },
      orderBy: { asOfDate: "desc" },
    }),
    prisma.qiSectorScoreSnapshot.findFirst({
      where: { modelVersion: QI_MODEL_VERSION },
      orderBy: { asOfDate: "desc" },
      select: { asOfDate: true },
    }),
    prisma.qiRecommendation.findFirst({
      where: { modelVersion: QI_MODEL_VERSION },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const sectorRows =
    latestSectorDate != null
      ? await prisma.qiSectorScoreSnapshot.findMany({
          where: {
            asOfDate: latestSectorDate.asOfDate,
            modelVersion: QI_MODEL_VERSION,
          },
          orderBy: { rank: "asc" },
        })
      : [];

  const payload = recommendation?.payload as
    | {
        weights?: { symbol: string; sectorCode: string; weight: number }[];
        macroRegime?: string | null;
        riskRegime?: string | null;
      }
    | null
    | undefined;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Mercado (QI)
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Regimes macro e de risco, ranking sectorial e última recomendação do
          motor em TypeScript (versão {QI_MODEL_VERSION}). Os dados dependem dos
          crons de ingestão.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Regime macro
          </h2>
          {macro ? (
            <p className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {macro.regimeLabel}
            </p>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">Sem snapshot.</p>
          )}
          {macro ? (
            <p className="mt-1 text-xs text-zinc-500">
              Data: {macro.asOfDate.toISOString().slice(0, 10)}
            </p>
          ) : null}
        </div>
        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Regime de risco
          </h2>
          {risk ? (
            <p className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {risk.regimeLabel}
            </p>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">Sem snapshot.</p>
          )}
          {risk ? (
            <p className="mt-1 text-xs text-zinc-500">
              Data: {risk.asOfDate.toISOString().slice(0, 10)}
            </p>
          ) : null}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Setores (ETFs)
        </h2>
        {sectorRows.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">
            Nenhum score sectorial. Execute o cron de preços e depois o de
            setores.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {sectorRows.map((s) => (
              <li
                key={s.sectorCode}
                className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3"
              >
                <span className="font-medium text-zinc-900 dark:text-zinc-50">
                  {s.sectorCode}
                </span>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  rank {s.rank} · score {s.compositeScore.toString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Última recomendação
        </h2>
        {!recommendation ? (
          <p className="mt-2 text-sm text-zinc-500">
            Nenhuma recomendação gravada. Execute o cron qi-recommend após os
            setores.
          </p>
        ) : (
          <div className="mt-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-xs text-zinc-500">
              {recommendation.createdAt.toISOString()} · {recommendation.engine}
            </p>
            {(payload?.macroRegime != null || payload?.riskRegime != null) && (
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Macro: {payload?.macroRegime ?? "—"} · Risco:{" "}
                {payload?.riskRegime ?? "—"}
              </p>
            )}
            {payload?.weights && payload.weights.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {payload.weights.map((w) => (
                  <li
                    key={w.symbol}
                    className="flex justify-between text-sm text-zinc-800 dark:text-zinc-200"
                  >
                    <span>
                      {w.symbol}{" "}
                      <span className="text-zinc-500">({w.sectorCode})</span>
                    </span>
                    <span>{(w.weight * 100).toFixed(1)}%</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-zinc-500">
                Payload sem pesos (dados insuficientes).
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
