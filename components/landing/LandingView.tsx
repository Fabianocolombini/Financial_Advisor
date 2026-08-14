"use client";

import Link from "next/link";
import { useState } from "react";
import { formatPerf, perfClass } from "@/lib/format-market";
import { APP_NAME } from "@/lib/brand";
import { SymbolAvatar } from "@/components/catalog/SymbolAvatar";
import { rankMovers, type LandingTicker, type LandingViewModel } from "@/lib/landing/build-view";
import { LandingMiniChart } from "./LandingMiniChart";
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

function HorizonChange({
  label,
  value,
  align = "left",
}: {
  label: string;
  value: number | null;
  align?: "left" | "right";
}) {
  return (
    <span
      className={`flex min-w-[4.25rem] flex-col ${
        align === "right" ? "items-end text-right" : "items-start text-left"
      }`}
    >
      <span className="text-[9px] uppercase tracking-wide text-zinc-600">{label}</span>
      <Change value={value} />
    </span>
  );
}

function formatShare(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return "—";
  return `${pct < 10 ? pct.toFixed(1) : pct.toFixed(0)}%`;
}

function EntryMark() {
  return (
    <span
      title="Entry opportunity — the motor sees a window to add exposure"
      aria-label="Entry opportunity"
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400"
    >
      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 7l5 5-5 5M4 12h14"
        />
      </svg>
    </span>
  );
}

function TickerTape({ items }: { items: LandingTicker[] }) {
  if (items.length === 0) {
    return (
      <p className="px-4 py-4 text-center text-[11px] text-zinc-600">
        Data unavailable
      </p>
    );
  }
  const loop = [...items, ...items];
  return (
    <div className="overflow-hidden border-y border-[#d4af37]/20 bg-zinc-950">
      <div className="atlas-ticker-track flex w-max items-center gap-6 py-3.5 pr-6">
        {loop.map((row, i) => (
          <span
            key={`${row.symbol}-${i}`}
            className="flex shrink-0 items-center gap-2 text-xs"
          >
            <SymbolAvatar
              symbol={row.symbol}
              exchange={row.exchange}
              classId={row.classId}
              size="xs"
            />
            <span className="font-mono text-zinc-200">
              {row.classId === "index" ? row.name : row.symbol}
            </span>
            {row.entryOpportunity ? <EntryMark /> : null}
            <span className="flex items-baseline gap-1">
              <span className="text-[9px] text-zinc-600">1D</span>
              <Change value={row.changePercent} />
            </span>
            <span className="flex items-baseline gap-1">
              <span className="text-[9px] text-zinc-600">5D</span>
              <Change value={row.change5d} />
            </span>
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
  const [topHorizon, setTopHorizon] = useState<"1d" | "5d">("1d");
  const appHref = "/markets";
  const top10 = rankMovers(data.tape, topHorizon);

  const openLogin = () => {
    if (!authEnabled || signedIn) {
      window.location.href = appHref;
      return;
    }
    setLoginOpen(true);
  };

  return (
    <div className="min-h-full bg-black text-white">
      <header className="sticky top-0 z-[100] h-14 border-b border-[#d4af37]/20 bg-black/90 backdrop-blur-md">
        <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <img
              src="/atlas-logo.jpg"
              alt=""
              className="h-8 w-8 rounded-full object-cover object-top"
            />
            <span className="font-title text-sm tracking-[0.2em] text-[#d4af37]">
              {APP_NAME}
            </span>
          </Link>
          {signedIn ? (
            <Link
              href={appHref}
              className="rounded-md bg-[#d4af37] px-3 py-1.5 text-xs font-medium text-black hover:bg-[#e0c05a]"
            >
              Open app
            </Link>
          ) : (
            <button
              type="button"
              onClick={openLogin}
              className="rounded-md border border-[#d4af37]/40 px-3 py-1.5 text-xs text-[#d4af37] hover:bg-[#d4af37]/10"
            >
              Sign in
            </button>
          )}
        </div>
      </header>

      <main>
        <section className="relative mx-auto w-full max-w-3xl px-4 py-10 text-center sm:px-6 sm:py-14">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 mx-auto max-w-lg bg-[radial-gradient(ellipse_at_center,rgba(45,212,191,0.14),transparent_65%)]"
          />
          <h1 className="sr-only">{APP_NAME}</h1>
          <img
            src="/atlas-logo.jpg"
            alt="Atlas — macro signals, technicals, portfolio decisions"
            width={1024}
            height={682}
            className="relative mx-auto h-auto w-full max-w-xl"
          />
          <p className="font-body relative mx-auto mt-4 max-w-3xl text-lg leading-snug tracking-tight text-zinc-200 sm:text-2xl sm:leading-snug">
            Atlas identifies the best entry points across 17 asset classes, combining
            a macro engine with per-security technicals. The difference: this is not
            just signaling — it is portfolio management oriented toward income
            generation and capital preservation.
          </p>
          <div className="relative mt-8">
            {signedIn ? (
              <Link
                href={appHref}
                className="inline-flex rounded-md bg-[#d4af37] px-5 py-2.5 text-sm font-medium text-black hover:bg-[#e0c05a]"
              >
                Open Markets
              </Link>
            ) : (
              <button
                type="button"
                onClick={openLogin}
                className="inline-flex rounded-md bg-[#d4af37] px-5 py-2.5 text-sm font-medium text-black hover:bg-[#e0c05a]"
              >
                Get started
              </button>
            )}
          </div>
        </section>

        <TickerTape
          items={data.tape.filter(
            (t) => t.changePercent != null || t.change5d != null,
          )}
        />

        <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-[#d4af37]/80">
                Top 10
              </h2>
              <div
                className="flex gap-0.5 rounded-md border border-zinc-800 p-0.5"
                role="group"
                aria-label="Top 10 range"
              >
                {(["1d", "5d"] as const).map((id) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={topHorizon === id}
                    onClick={() => setTopHorizon(id)}
                    className={`rounded px-2 py-0.5 text-[10px] ${
                      topHorizon === id
                        ? "bg-zinc-800 text-white"
                        : "text-zinc-600 hover:text-zinc-300"
                    }`}
                  >
                    {id === "1d" ? "1D" : "5D"}
                  </button>
                ))}
              </div>
            </div>
            {top10.length === 0 ? (
              <p className="mt-3 text-xs text-zinc-600">Data unavailable</p>
            ) : (
              <ol className="mt-4 grid overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/70 sm:grid-cols-2">
                {top10.map((row, i) => (
                  <li
                    key={row.symbol}
                    className="flex items-center justify-between gap-2 border-b border-zinc-800/80 px-3 py-2.5 text-xs sm:odd:border-r"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="w-4 text-right font-mono text-[#d4af37]/70">
                        {i + 1}
                      </span>
                      <SymbolAvatar
                        symbol={row.symbol}
                        exchange={row.exchange}
                        classId={row.classId}
                        size="xs"
                      />
                      <span className="min-w-0">
                        <span className="font-mono text-zinc-200">{row.symbol}</span>
                        {row.entryOpportunity ? (
                          <span className="ml-1 inline-block align-middle">
                            <EntryMark />
                          </span>
                        ) : null}
                        <span className="ml-2 hidden text-zinc-600 sm:inline">
                          {row.classLabel}
                        </span>
                      </span>
                    </span>
                    <span className="flex shrink-0 items-end gap-3">
                      <HorizonChange label="1D" value={row.changePercent} align="right" />
                      <HorizonChange label="5D" value={row.change5d} align="right" />
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="mt-10">
            <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-[#d4af37]/80">
              Asset groups
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.classes.map((group) => (
                <article
                  key={group.classId}
                  className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 transition hover:border-[#d4af37]/35"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="flex -space-x-2">
                        {group.featured.slice(0, 3).map((row) => (
                          <SymbolAvatar
                            key={row.symbol}
                            symbol={row.symbol}
                            exchange={row.exchange}
                            classId={row.classId}
                            size="xs"
                          />
                        ))}
                      </div>
                      <h3 className="truncate text-sm font-medium text-white">
                        {group.label}
                      </h3>
                      {group.entryOpportunity ? <EntryMark /> : null}
                    </div>
                    <span
                      className="shrink-0 text-[11px] tabular-nums text-zinc-400"
                      title={`${group.label} share of the Atlas mix`}
                    >
                      {formatShare(group.shareOfMixPct)}
                      <span className="ml-1 text-[9px] uppercase tracking-wide text-zinc-600">
                        of mix
                      </span>
                    </span>
                  </div>
                  {group.chartSymbol ? (
                    <LandingMiniChart symbol={group.chartSymbol} />
                  ) : null}
                  <div className="mt-2 flex items-end justify-between gap-2">
                    <HorizonChange label="1D" value={group.changePercent} />
                    <HorizonChange label="5D" value={group.change5d} align="right" />
                  </div>
                  {!group.available ? (
                    <p className="mt-2 text-xs text-zinc-600">Data unavailable</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5">
                      {group.featured.map((row) => (
                        <li
                          key={row.symbol}
                          className="flex items-center justify-between gap-1.5 text-xs"
                        >
                          <HorizonChange label="1D" value={row.changePercent} />
                          <span className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
                            <SymbolAvatar
                              symbol={row.symbol}
                              exchange={row.exchange}
                              classId={row.classId}
                              size="xs"
                            />
                            <span className="font-mono text-zinc-200">{row.symbol}</span>
                            {row.entryOpportunity ? <EntryMark /> : null}
                            <span
                              className="tabular-nums text-[10px] text-zinc-500"
                              title={`${row.symbol} share of ${group.label}`}
                            >
                              {formatShare(row.shareOfGroupPct)}
                            </span>
                          </span>
                          <HorizonChange
                            label="5D"
                            value={row.change5d}
                            align="right"
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          </div>

          <p className="mt-8 text-[10px] text-zinc-600">
            {data.asOf ? `Motor as of ${data.asOf}. ` : null}
            Mix weights follow the motor sleeve stance. Educational use only — not
            investment advice.
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
