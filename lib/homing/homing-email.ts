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
  const subject = `Atlas Homing — book ${bookPnl} · ${view.approaching.canAddCount} closer to a buy`;

  const lotLines = view.book.lots
    .map((row) => {
      const day = row.dayPct != null ? formatPerf(row.dayPct) : "—";
      return `• ${row.symbol}  ${row.action}  ${day}\n  ${row.hint}`;
    })
    .join("\n");
  const buyLines = view.approaching.rows
    .map((row) => {
      const day = row.perf1dPct != null ? formatPerf(row.perf1dPct) : "—";
      return `• ${row.symbol}  score ${formatScore(row.score)}  Δ ${deltaScore(row.scoreDelta)}  1D ${day}`;
    })
    .join("\n");

  const asOf = view.asOf ? `Close ${view.asOf}` : "Today";
  const text = [
    `Atlas Homing — ${asOf}`,
    "",
    "MY BOOK",
    view.book.narrative,
    `Invested ${money(view.book.invested)} → now ${money(view.book.gross)} (day ${bookPnl} / ${formatPerf(view.book.dayPct)})`,
    lotLines || "No lots yet.",
    "",
    "APPROACHING A BUY",
    view.approaching.narrative,
    buyLines || "No Can add names today.",
    "",
    "This is an educational briefing from Atlas, not regulated investment advice.",
    `Open Homing: ${input.walletUrl}`,
  ].join("\n");

  const lotHtml = view.book.lots
    .map(
      (row) => `<tr>
  <td style="padding:8px 0;border-bottom:1px solid #e4e4e7;font-family:ui-monospace,Menlo,monospace;font-size:13px">${escapeHtml(row.symbol)}</td>
  <td style="padding:8px 0;border-bottom:1px solid #e4e4e7;font-size:13px">${escapeHtml(row.action)}</td>
  <td style="padding:8px 0;border-bottom:1px solid #e4e4e7;font-size:13px;text-align:right">${escapeHtml(row.dayPct != null ? formatPerf(row.dayPct) : "—")}</td>
</tr>
<tr><td colspan="3" style="padding:0 0 12px;font-size:12px;color:#71717a">${escapeHtml(row.hint)}</td></tr>`,
    )
    .join("");
  const buyHtml = view.approaching.rows
    .map(
      (row) => `<tr>
  <td style="padding:8px 0;border-bottom:1px solid #e4e4e7;font-family:ui-monospace,Menlo,monospace;font-size:13px">${escapeHtml(row.symbol)}</td>
  <td style="padding:8px 0;border-bottom:1px solid #e4e4e7;font-size:13px;text-align:right">${escapeHtml(deltaScore(row.scoreDelta))}</td>
  <td style="padding:8px 0;border-bottom:1px solid #e4e4e7;font-size:13px;text-align:right">${escapeHtml(row.perf1dPct != null ? formatPerf(row.perf1dPct) : "—")}</td>
</tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#fafafa;color:#111;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:24px">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#a16207">Atlas</p>
    <h1 style="margin:0 0 8px;font-size:20px">Homing</h1>
    <p style="margin:0 0 16px;font-size:13px;color:#71717a">${escapeHtml(asOf)}</p>
    <h2 style="margin:24px 0 8px;font-size:14px;letter-spacing:0.04em;text-transform:uppercase;color:#3f3f46">My book</h2>
    <p style="margin:0 0 8px;font-size:14px;line-height:1.5">${escapeHtml(view.book.narrative)}</p>
    <p style="margin:0 0 12px;font-size:13px;color:#71717a">Day ${escapeHtml(bookPnl)} · now ${escapeHtml(money(view.book.gross))}</p>
    <table width="100%" cellpadding="0" cellspacing="0">${lotHtml}</table>
    <h2 style="margin:24px 0 8px;font-size:14px;letter-spacing:0.04em;text-transform:uppercase;color:#3f3f46">Approaching a buy</h2>
    <p style="margin:0 0 12px;font-size:14px;line-height:1.5">${escapeHtml(view.approaching.narrative)}</p>
    <table width="100%" cellpadding="0" cellspacing="0">${buyHtml}</table>
    <p style="margin:24px 0 0;font-size:12px;color:#71717a;line-height:1.5">This is an educational briefing from Atlas, not regulated investment advice.</p>
    <p style="margin:12px 0 0"><a href="${escapeHtml(input.walletUrl)}" style="color:#a16207">Open Homing</a></p>
  </div>
</body>
</html>`;

  return { subject, text, html };
}
