"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { formatPerf, perfClass } from "@/lib/format-market";
import { APP_NAME } from "@/lib/brand";
import type { LandingTicker, LandingViewModel } from "@/lib/landing/build-view";
import { LoginModal } from "./LoginModal";

function Change({ value }: { value: number | null }) {
  if (value == null) {
    return <span className="text-[11px] text-zinc-600">—</span>;
  }
  const arrow = value > 0 ? "▲" : value < 0 ? "▼" : "→";
  return (
    <span className={`tabular-nums ${perfClass(value)}`}>
      {arrow} {formatPerf(value)}
    </span>
  );
}

function TickerTape({ items }: { items: LandingTicker[] }) {
  if (items.length === 0) {
    return (
      <p className="px-4 py-3 text-center text-[11px] text-zinc-600">
        Data unavailable
      </p>
    );
  }
  const loop = [...items, ...items];
  return (
    <div className="overflow-hidden border-y border-zinc-800 bg-black">
      <div className="atlas-ticker-track flex w-max gap-8 py-2.5 pr-8">
        {loop.map((row, i) => (
          <span
            key={`${row.symbol}-${i}`}
            className="flex shrink-0 items-baseline gap-2 text-xs"
          >
            <span className="font-mono text-zinc-200">{row.symbol}</span>
            <Change value={row.changePercent} />
          </span>
        ))}
      </div>
    </div>
  );
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
            {APP_NAME}
          </Link>
          {signedIn ? (
            <Link
              href={appHref}
              className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-zinc-200"
            >
              Open app
            </Link>
          ) : (
            <button
              type="button"
              onClick={openLogin}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-900"
            >
              Sign in
            </button>
          )}
        </div>
      </header>

      <main>
        <section className="mx-auto w-full max-w-3xl px-4 py-10 text-center sm:px-6 sm:py-14">
          <h1 className="sr-only">{APP_NAME}</h1>
          <Image
            src="/atlas-logo.jpg"
            alt="Atlas — macro signals, technicals, portfolio decisions"
            width={1024}
            height={682}
            priority
            className="mx-auto h-auto w-full max-w-xl"
          />
          <p className="mx-auto mt-6 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Atlas identifies the best entry points across 17 asset classes, combining
            a macro engine with per-security technicals. The difference: this is not
            just signaling — it is portfolio management oriented toward income
            generation and capital preservation.
          </p>
          <div className="mt-8">
            {signedIn ? (
              <Link
                href={appHref}
                className="inline-flex rounded-md bg-white px-5 py-2.5 text-sm font-medium text-black hover:bg-zinc-200"
              >
                Open Markets
              </Link>
            ) : (
              <button
                type="button"
                onClick={openLogin}
                className="inline-flex rounded-md bg-white px-5 py-2.5 text-sm font-medium text-black hover:bg-zinc-200"
              >
                Get started
              </button>
            )}
          </div>
        </section>

        <TickerTape items={data.tape} />

        <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <h2 className="text-sm font-medium text-zinc-300">Asset groups</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {data.classes.map((group) => (
                  <article
                    key={group.classId}
                    className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="text-sm font-medium text-white">{group.label}</h3>
                      <Change value={group.changePercent} />
                    </div>
                    {!group.available ? (
                      <p className="mt-3 text-xs text-zinc-600">Data unavailable</p>
                    ) : (
                      <ul className="mt-3 space-y-1.5">
                        {group.featured.map((row) => (
                          <li
                            key={row.symbol}
                            className="flex items-baseline justify-between gap-2 text-xs"
                          >
                            <span className="font-mono text-zinc-300">{row.symbol}</span>
                            <Change value={row.changePercent} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                ))}
              </div>
            </div>

            <aside>
              <h2 className="text-sm font-medium text-zinc-300">Top 10 — 1D change</h2>
              {data.top10.length === 0 ? (
                <p className="mt-3 text-xs text-zinc-600">Data unavailable</p>
              ) : (
                <ol className="mt-3 divide-y divide-zinc-800 rounded-xl border border-zinc-800">
                  {data.top10.map((row, i) => (
                    <li
                      key={row.symbol}
                      className="flex items-baseline justify-between gap-3 px-3 py-2.5 text-xs"
                    >
                      <span className="min-w-0">
                        <span className="mr-2 text-zinc-600">{i + 1}</span>
                        <span className="font-mono text-zinc-200">{row.symbol}</span>
                        <span className="ml-2 hidden text-zinc-600 sm:inline">
                          {row.classLabel}
                        </span>
                      </span>
                      <Change value={row.changePercent} />
                    </li>
                  ))}
                </ol>
              )}
            </aside>
          </div>

          <p className="mt-8 text-[10px] text-zinc-600">
            {data.asOf ? `Motor as of ${data.asOf}. ` : null}
            Educational use only — not investment advice.
          </p>
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
