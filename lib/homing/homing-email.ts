import { formatPerf } from "@/lib/format-market";
import { formatScore } from "@/lib/motor/format-scores";
import type { HomingViewModel } from "./build-homing";

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return USD.format(value);
}

function signedMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const formatted = USD.format(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function deltaScore(value: number | null): string {
  if (value == null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(3)}`;
}

export function composeHomingEmail(input: {
  view: HomingViewModel;
  walletUrl: string;
}): {
  subject: string;
  text: string;
  html: string;
} {
  const { view } = input;
  const bookPnl =
    view.book.dayPnl != null
      ? `${view.book.dayPnl >= 0 ? "+" : ""}${money(view.book.dayPnl)}`
      : "—";
  const subject = `Atlas Daily Digest — book ${bookPnl} · ${view.approaching.canAddCount} Can add`;

  const lotLines = view.book.lots
    .map((row) => {
      const day = row.dayPct != null ? formatPerf(row.dayPct) : "—";
      const vsCost = row.vsCostPct != null ? formatPerf(row.vsCostPct) : "—";
      return `• ${row.symbol}  ${row.action}  day ${day}  vs cost ${vsCost}\n  ${row.hint}`;
    })
    .join("\n");
  const buyLines = view.approaching.rows
    .map((row) => {
      const day = row.perf1dPct != null ? formatPerf(row.perf1dPct) : "—";
      const week = row.perf7dPct != null ? formatPerf(row.perf7dPct) : "—";
      return `• ${row.symbol}  ${row.moneyGlyph} ${row.moneyLabel}  to buy ${row.proximity.value}${row.proximity.axis ? ` ${row.proximity.axis}` : ""}  1D ${day}  7D ${week}  score ${formatScore(row.score)}  Δ ${deltaScore(row.scoreDelta)}`;
    })
    .join("\n");

  const asOf = view.asOf ? `Close ${view.asOf}` : "Today";
  const vsCostLine =
    view.book.vsCostAbs != null
      ? `Vs cost ${signedMoney(view.book.vsCostAbs)} / ${formatPerf(view.book.vsCostPct)}.`
      : "";
  const incomplete = view.book.incomplete
    ? ` Worth now covers ${view.book.quotedLots} of ${view.book.totalLots} lots with a live price.`
    : "";
  const text = [
    `Atlas Daily Digest — ${asOf}`,
    "",
    "MY BOOK",
    view.book.narrative,
    `You paid ${money(view.book.invested)}. Worth now ${money(view.book.gross)}. ${vsCostLine} Vs yesterday ${bookPnl} / ${formatPerf(view.book.dayPct)}.${incomplete}`,
    lotLines || "No lots yet.",
    "",
    "APPROACHING A BUY",
    "Money + is the only buy. To buy is how far from a motor Buy (Class = sleeve, Name = paper). … is Wait — do not add cash yet, even if 7D is green. × is Do not add. 1D/7D is the price, not an entry.",
    view.approaching.narrative,
    buyLines || "No scored names today.",
    "",
    "This is an educational briefing from Atlas, not regulated investment advice.",
    `Open Daily Digest: ${input.walletUrl}`,
  ].join("\n");

  const lotHtml = view.book.lots
    .map(
      (row) => `<tr>
  <td style="padding:8px 0;border-bottom:1px solid #e4e4e7;font-family:ui-monospace,Menlo,monospace;font-size:13px">${escapeHtml(row.symbol)}</td>
  <td style="padding:8px 0;border-bottom:1px solid #e4e4e7;font-size:13px">${escapeHtml(row.action)}</td>
  <td style="padding:8px 0;border-bottom:1px solid #e4e4e7;font-size:13px;text-align:right">${escapeHtml(row.dayPct != null ? formatPerf(row.dayPct) : "—")}</td>
  <td style="padding:8px 0;border-bottom:1px solid #e4e4e7;font-size:13px;text-align:right">${escapeHtml(row.vsCostPct != null ? formatPerf(row.vsCostPct) : "—")}</td>
</tr>
<tr><td colspan="4" style="padding:0 0 12px;font-size:12px;color:#71717a">${escapeHtml(row.hint)}</td></tr>`,
    )
    .join("");
  const buyHtml = view.approaching.rows
    .map(
      (row) => `<tr>
  <td style="padding:8px 0;border-bottom:1px solid #e4e4e7;font-family:ui-monospace,Menlo,monospace;font-size:13px">${escapeHtml(row.symbol)}</td>
  <td style="padding:8px 0;border-bottom:1px solid #e4e4e7;font-size:13px">${escapeHtml(`${row.moneyGlyph} ${row.moneyLabel}`)}</td>
  <td style="padding:8px 0;border-bottom:1px solid #e4e4e7;font-size:13px">${escapeHtml(`${row.proximity.value}${row.proximity.axis ? ` ${row.proximity.axis}` : ""}`)}</td>
  <td style="padding:8px 0;border-bottom:1px solid #e4e4e7;font-size:13px;text-align:right">${escapeHtml(row.perf1dPct != null ? formatPerf(row.perf1dPct) : "—")}</td>
  <td style="padding:8px 0;border-bottom:1px solid #e4e4e7;font-size:13px;text-align:right">${escapeHtml(row.perf7dPct != null ? formatPerf(row.perf7dPct) : "—")}</td>
</tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#fafafa;color:#111;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:24px">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#a16207">Atlas</p>
    <h1 style="margin:0 0 8px;font-size:20px">Daily Digest</h1>
    <p style="margin:0 0 16px;font-size:13px;color:#71717a">${escapeHtml(asOf)}</p>
    <h2 style="margin:24px 0 8px;font-size:14px;letter-spacing:0.04em;text-transform:uppercase;color:#3f3f46">My book</h2>
    <p style="margin:0 0 8px;font-size:14px;line-height:1.5">${escapeHtml(view.book.narrative)}</p>
    <p style="margin:0 0 12px;font-size:13px;color:#71717a">You paid ${escapeHtml(money(view.book.invested))} · worth now ${escapeHtml(money(view.book.gross))} · vs yesterday ${escapeHtml(bookPnl)}</p>
    <table width="100%" cellpadding="0" cellspacing="0">${lotHtml}</table>
    <h2 style="margin:24px 0 8px;font-size:14px;letter-spacing:0.04em;text-transform:uppercase;color:#3f3f46">Approaching a buy</h2>
    <p style="margin:0 0 8px;font-size:12px;color:#71717a">Money + is the only buy. To buy is distance to Buy (Class = sleeve, Name = paper). … Wait is not a buy, even if 7D is green. × Do not add. 1D/7D is price.</p>
    <p style="margin:0 0 12px;font-size:14px;line-height:1.5">${escapeHtml(view.approaching.narrative)}</p>
    <table width="100%" cellpadding="0" cellspacing="0">${buyHtml}</table>
    <p style="margin:24px 0 0;font-size:12px;color:#71717a;line-height:1.5">This is an educational briefing from Atlas, not regulated investment advice.</p>
    <p style="margin:12px 0 0"><a href="${escapeHtml(input.walletUrl)}" style="color:#a16207">Open Daily Digest</a></p>
  </div>
</body>
</html>`;

  return { subject, text, html };
}
