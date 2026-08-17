import type { SymbolMotorContext } from "@/lib/motor/snapshot-types";
import { formatScore } from "@/lib/motor/format-scores";
import { stageBadgeClass, entryBadgeClass } from "@/lib/motor/format-scores";
import { MotorIndicatorsTable } from "./MotorTechnicals";
import { SymbolClassRegimeModelPanel } from "./SymbolClassRegimeModelPanel";
import { SymbolScoreHistoryChart } from "./SymbolScoreHistoryChart";
import { IndicatorFredChart } from "./IndicatorFredChart";

export function ClassMacroSection({
  motor,
  classLabel,
}: {
  motor: SymbolMotorContext;
  classLabel: string;
}) {
  const snap = motor.classSnap;
  if (!motor.hasClassMotor || !snap) {
    return (
      <p className="text-sm text-zinc-500">Class macro for {classLabel} is pending in the snapshot.</p>
    );
  }

  return (
    <section className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-medium text-white">Sleeve macro — {classLabel}</h3>
        <span className="text-xs text-zinc-400">Score {formatScore(snap.score)}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset ${stageBadgeClass(
            snap.stageLabel,
          )}`}
        >
          {snap.stageLabel}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset ${entryBadgeClass(
            snap.entryValidated ?? false,
            true,
          )}`}
        >
          {snap.entryValidated ? "Entry validated" : "Entry not validated"}
        </span>
      </div>
      {snap.dominantIndicator ? (
        <p className="text-xs text-zinc-500">
          Driver: {snap.dominantIndicator.name}
          {snap.dominantIndicator.contribution != null
            ? ` (${snap.dominantIndicator.contribution.toFixed(3)})`
            : ""}
        </p>
      ) : null}
      {motor.classRationale.length > 0 ? (
        <ul className="text-xs text-zinc-400">
          {motor.classRationale.map((r) => (
            <li key={r}>• {r}</li>
          ))}
        </ul>
      ) : null}
      <SymbolClassRegimeModelPanel
        regimeModel={snap.regimeModel}
        classId={motor.classId ?? snap.classId}
      />
      <MotorIndicatorsTable indicators={motor.classIndicators} title="All class indicators" />
      <SymbolScoreHistoryChart
        title="Class composite score (history)"
        points={motor.classScoreHistory}
        color="#38bdf8"
      />
      {snap.dominantIndicator ? (
        <IndicatorFredChart
          indicatorId={snap.dominantIndicator.id}
          indicatorName={snap.dominantIndicator.name}
        />
      ) : null}
    </section>
  );
}

export function TickerMotorSection({ motor }: { motor: SymbolMotorContext }) {
  if (!motor.hasTickerMotor || !motor.ticker) {
    return (
      <p className="text-sm text-zinc-500">
        No individual motor score — using class macro as the reference.
      </p>
    );
  }

  const tick = motor.ticker;
  return (
    <section className="space-y-4 rounded-lg border border-zinc-800 bg-black p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-medium text-white">Security — {tick.symbol}</h3>
        <span className="text-xs text-zinc-400">Score {formatScore(tick.score)}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset ${stageBadgeClass(
            tick.stageLabel,
          )}`}
        >
          {tick.stageLabel}
        </span>
        {motor.divergesFromClass ? (
          <span className="text-[10px] text-amber-400">Diverges from class</span>
        ) : null}
      </div>
      <MotorIndicatorsTable
        indicators={motor.tickerIndicators}
        title={
          motor.classId === "cash_equivalents"
            ? "SecurityScore drivers (no RSI)"
            : "SecurityScore drivers"
        }
      />
      {motor.classId === "cash_equivalents" ? (
        <p className="text-[10px] text-zinc-500">
          SecurityScore: 50% traded volume + 35% 20-day vol (inverted) + 15% |MA50|
          z-score (inverted). Ranks cash instruments on the same day — does not change
          CashRegimeScore. RSI is excluded so yield drift is not read as momentum.
        </p>
      ) : motor.classId === "fi_treasury" ? (
        <p className="text-[10px] text-zinc-500">
          SecurityScore: 35% trend/duration + 25% RSI(return/duration) + 20% traded
          volume + 20% inverted COT (last weekly print held until the next release).
          Ranks curve points on the same day — does not change TreasuryRegimeScore.
          RSI is kept because Treasuries have genuine rate-reversal cycles.
        </p>
      ) : motor.classId === "fi_ig" ? (
        <p className="text-[10px] text-zinc-500">
          SecurityScore: 30% trend/duration + 20% RSI(return/duration) + 15% traded
          volume + 35% duration fit vs term premium (same duration band, same fit).
          Ranks IG names on the same day — does not change IGRegimeScore. Credit OAS
          is a class index (FRED), so it stays in the regime layer.
        </p>
      ) : motor.classId === "fi_hy" ? (
        <p className="text-[10px] text-zinc-500">
          SecurityScore: 35% trend + 25% RSI + 15% traded volume + 25% inverted 20-day
          vol vs peers that day. Ranks HY names on the same day — does not change
          HYRegimeScore. OAS (including BB/B/CCC) is a class/bucket index, so credit
          stays in the regime layer for this broad-HY sleeve.
        </p>
      ) : motor.classId === "fi_tips" ? (
        <p className="text-[10px] text-zinc-500">
          SecurityScore: 30% trend/duration + 20% RSI(return/duration) + 15% traded
          volume + 35% duration fit vs real yield (same duration band, same fit).
          Uses ETF market close (yfinance), not a TIPS dirty bond price. Ranks TIPS
          names on the same day — does not change TIPSRegimeScore.
        </p>
      ) : motor.classId === "fi_preferred" ? (
        <p className="text-[10px] text-zinc-500">
          SecurityScore: 30% trend + 20% RSI + 25% dividend yield (haircut if the
          yield spiked vs its own history) + 25% inverted 20-day vol. A crash that
          inflates yield is not extra carry. Ranks preferred names on the same day —
          does not change PreferredRegimeScore.
        </p>
      ) : motor.classId === "us_equity" ? (
        <p className="text-[10px] text-zinc-500">
          SecurityScore: 35% trend + 25% RSI + 20% dollar volume (price × shares)
          + 20% inverted 20-day vol vs peers that day. Share count would favor
          cheap names; this uses dollars. Ranks US names on the same day — does
          not change USEquityRegimeScore. No P/E or ROE in this layer.
        </p>
      ) : motor.classId === "intl_equity" ? (
        <p className="text-[10px] text-zinc-500">
          SecurityScore: 30% trend + 20% RSI + 20% inverted 20-day vol + 30%
          dollar-beta fit vs UUP (closer to the class target is better). Uses the
          USD ETF close — there is no local-currency series for EFA/VEA. Ranks
          international names on the same day — does not change
          IntlEquityRegimeScore.
        </p>
      ) : motor.classId === "em_equity" ? (
        <p className="text-[10px] text-zinc-500">
          SecurityScore: 30% trend + 20% RSI + 20% dollar volume + 30% China-beta
          fit vs FXI (closer to the class target is better). No 20-day vol
          pillar: swing is a class property in EMEquityRegimeScore. Ranks EM
          names on the same day — does not change the regime score.
        </p>
      ) : motor.classId === "real_estate" || motor.classId === "reits" ? (
        <p className="text-[10px] text-zinc-500">
          SecurityScore: 30% trend on the ETF close (not total return) + 35%
          dividend yield after a crash haircut + 20% dollar volume + 15% inverted
          20-day vol. No RSI. Minus the 10-year Treasury does not change the
          rank — that comparison is in REITsRegimeScore. Ranks REIT names on the
          same day.
        </p>
      ) : motor.classId === "commodities_precious" ? (
        <p className="text-[10px] text-zinc-500">
          SecurityScore: 35% trend + 25% RSI + 25% dollar volume + 15% inverted
          expense ratio. Gold COT and GLD holdings stay in PreciousRegimeScore —
          they are the same for every name that day and do not change the rank.
          Ranks metal funds on the same day.
        </p>
      ) : motor.classId === "commodities_energy" ? (
        <p className="text-[10px] text-zinc-500">
          SecurityScore: 35% trend / |oil-beta| + 20% RSI / |oil-beta| + 20%
          dollar volume + 25% oil-adherence fit vs USO (closer to the class
          target is better). Inventories, rigs, and WTI COT stay in
          EnergyRegimeScore. Ranks energy names on the same day.
        </p>
      ) : motor.classId === "energy_mlp" ? (
        <p className="text-[10px] text-zinc-500">
          SecurityScore: 30% trend on the ETF close (not total return) + 30%
          distribution yield after a crash haircut + 20% dollar volume + 20%
          inverted 20-day vol. No RSI. No oil-beta pillar — this sleeve is
          midstream. Ranks MLP funds on the same day.
        </p>
      ) : motor.classId === "alt_bdc" || motor.classId === "credito_alternativo" ? (
        <p className="text-[10px] text-zinc-500">
          SecurityScore: 30% NAV discount (inverted; live price vs last NAV) +
          30% inverted non-accrual + 25% NII / dividends coverage + 15% trend on
          the close. No RSI. No raw yield — coverage is the anti-trap. Ranks
          listed BDCs on the same day. SOFR and HY OAS stay in BDCRegimeScore.
        </p>
      ) : null}
      <SymbolScoreHistoryChart
        title="Ticker composite score (history)"
        points={motor.tickerScoreHistory}
        color="#34d399"
      />
    </section>
  );
}
