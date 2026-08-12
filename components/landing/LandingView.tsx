"use client";

import Link from "next/link";
import { useState } from "react";
import { formatPerf, perfClass } from "@/lib/format-market";
import { IndicatorTrend } from "@/components/symbol/IndicatorTrend";
import type { LandingViewModel } from "@/lib/landing/build-view";
import { LoginModal } from "./LoginModal";

function directionOf(change: number | null): "up" | "down" | "flat" {
  if (change == null || change === 0) return "flat";
  return change > 0 ? "up" : "down";
}

export function LandingView({
  data,
  signedIn,
  authEnabled,
  googleConfigured,
}: {
  data: LandingViewModel;
  signedIn: boolean;
  authEnabled: boolean;
  googleConfigured: boolean;
}) {
  const [loginOpen, setLoginOpen] = useState(false);
  const appHref = "/mercado";

  const openLogin = () => {
    if (!authEnabled || signedIn) {
      window.location.href = appHref;
      return;
    }
    setLoginOpen(true);
  };

  return (
    <div className="min-h-full bg-black text-white">
      <header className="sticky top-0 z-[100] h-14 border-b border-zinc-800 bg-black/90 backdrop-blur-md">
        <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="font-title text-sm tracking-tight text-white">
            Atlas
          </Link>
          {signedIn ? (
            <Link
              href={appHref}
              className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-zinc-200"
            >
              Abrir o app
            </Link>
          ) : (
            <button
              type="button"
              onClick={openLogin}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-900"
            >
              Entrar
            </button>
          )}
        </div>
      </header>

      <main>
        <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <h1 className="font-title max-w-3xl text-3xl tracking-tight text-white sm:text-4xl">
            Atlas{" "}
            <span className="text-zinc-400">
              — sinais macro + técnicos para decisões de carteira
            </span>
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Atlas identifica os melhores pontos de entrada em 17 classes de ativos,
            combinando um motor macro com indicadores técnicos por ativo. Diferencial:
            não é só sinalização — é gestão de carteira orientada a geração de renda e
            preservação de capital.
          </p>
          <div className="mt-6">
            {signedIn ? (
              <Link
                href={appHref}
                className="inline-flex rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-200"
              >
                Abrir Markets
              </Link>
            ) : (
              <button
                type="button"
                onClick={openLogin}
                className="inline-flex rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-200"
              >
                Começar
              </button>
            )}
          </div>
        </section>

        <section
          aria-label="Índices principais"
          className="border-y border-zinc-800 bg-zinc-950/80"
        >
          <div className="mx-auto flex w-full max-w-6xl gap-6 overflow-x-auto px-4 py-3 sm:px-6">
            {data.indices.map((row) => (
              <div key={row.id} className="flex shrink-0 items-baseline gap-2">
                <span className="text-xs font-medium text-zinc-300">{row.label}</span>
                {row.changePercent == null ? (
                  <span className="text-[11px] text-zinc-600">dados indisponíveis</span>
                ) : (
                  <span className={`text-xs tabular-nums ${perfClass(row.changePercent)}`}>
                    {row.changePercent > 0 ? "▲" : row.changePercent < 0 ? "▼" : "→"}{" "}
                    {formatPerf(row.changePercent)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
          <h2 className="text-sm font-medium text-zinc-300">Grupos de ativos</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.groups.map((group) => (
              <article
                key={group.id}
                className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-medium text-white">{group.label}</h3>
                  {group.regimeLabel ? (
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300">
                      {group.regimeLabel}
                    </span>
                  ) : null}
                </div>
                {!group.available ? (
                  <p className="mt-6 text-xs text-zinc-600">Dados indisponíveis</p>
                ) : (
                  <div className="mt-4 flex items-end justify-between gap-3">
                    <IndicatorTrend
                      sparklineData={group.sparkline}
                      direction={directionOf(group.changePercent)}
                      compact
                    />
                    {group.changePercent == null ? (
                      <span className="text-[11px] text-zinc-600">sem variação 1D</span>
                    ) : (
                      <span
                        className={`text-sm tabular-nums ${perfClass(group.changePercent)}`}
                      >
                        {formatPerf(group.changePercent)}
                      </span>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
          <h2 className="text-sm font-medium text-zinc-300">O que mais mexeu hoje</h2>
          {data.movers.length === 0 ? (
            <p className="mt-3 text-xs text-zinc-600">Dados indisponíveis</p>
          ) : (
            <ul className="mt-3 divide-y divide-zinc-800 rounded-xl border border-zinc-800">
              {data.movers.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between px-4 py-3 text-sm"
                >
                  <span className="text-zinc-200">{row.label}</span>
                  <span className={`tabular-nums ${perfClass(row.changePercent)}`}>
                    {row.changePercent > 0 ? "▲" : "▼"} {formatPerf(row.changePercent)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {data.asOf ? (
            <p className="mt-4 text-[10px] text-zinc-600">
              Motor as of {data.asOf}. Uso educacional — não é assessoria de investimento.
            </p>
          ) : (
            <p className="mt-4 text-[10px] text-zinc-600">
              Uso educacional — não é assessoria de investimento.
            </p>
          )}
        </section>
      </main>

      <LoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        googleConfigured={googleConfigured}
      />
    </div>
  );
}
