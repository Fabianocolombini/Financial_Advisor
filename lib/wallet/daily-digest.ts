import { formatPerf, formatPrice } from "@/lib/format-market";
import type { WalletAction } from "./position-status";
import { actionNeedsAlert } from "./position-status";
import { summarizeWallet } from "./summary";
import type { WalletAlertView, WalletHoldingView } from "./types";

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const SECTION_ORDER: WalletAction[] = ["add", "stay", "leave", "falling"];

const SECTION_TITLE: Record<WalletAction, string> = {
  add: "Buy more",
  stay: "Hold",
  leave: "Exit",
  falling: "Downtrend — exit",
};

export type WalletDigestEmail = {
  subject: string;
  text: string;
  html: string;
  decisionItems: WalletAlertView["items"];
};

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

function formatAsOf(asOf: Date): string {
  return asOf.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
}

function counts(holdings: WalletHoldingView[]) {
  let buy = 0;
  let hold = 0;
  let exit = 0;
  for (const row of holdings) {
    const action = row.status.action.action;
    if (action === "add") buy += 1;
    else if (action === "stay") hold += 1;
    else exit += 1;
  }
  return { buy, hold, exit };
}

function subjectLine(holdings: WalletHoldingView[]): string {
  const { buy, hold, exit } = counts(holdings);
  if (buy === 0 && exit === 0) {
    return `Atlas wallet — all Hold (${hold} name${hold === 1 ? "" : "s"})`;
  }
  const parts: string[] = [];
  if (buy > 0) parts.push(`${buy} to buy more`);
  if (exit > 0) parts.push(`${exit} to exit`);
  if (hold > 0) parts.push(`${hold} hold`);
  return `Atlas wallet — ${parts.join(", ")}`;
}

function lotLine(row: WalletHoldingView): string {
  const pnl =
    row.status.pnlPct != null
      ? ` vs cost ${formatPerf(row.status.pnlPct)}`
      : "";
  const last =
    row.last != null ? ` last ${formatPrice(row.last)}` : " last —";
  return `${row.symbol}  ${row.status.action.label}${last}${pnl}`;
}

function decisionItems(holdings: WalletHoldingView[]): WalletAlertView["items"] {
  return holdings
    .filter((row) => actionNeedsAlert(row.status.action.action))
    .map((row) => ({
      symbol: row.symbol,
      action: row.status.action.action,
      label: row.status.action.label,
      hint: row.status.action.hint,
      pnlPct: row.status.pnlPct,
    }));
}

export function composeWalletDigest(input: {
  holdings: WalletHoldingView[];
  walletUrl: string;
  asOf?: Date;
}): WalletDigestEmail {
  const asOf = input.asOf ?? new Date();
  const totals = summarizeWallet(input.holdings);
  const dateLabel = formatAsOf(asOf);
  const grouped = SECTION_ORDER.map((action) => ({
    action,
    title: SECTION_TITLE[action],
    rows: input.holdings.filter((row) => row.status.action.action === action),
  })).filter((section) => section.rows.length > 0);

  const pnlLine =
    totals.profit != null && totals.gross != null
      ? `Invested ${money(totals.invested)} → market ${money(totals.gross)} (P&L ${money(totals.profit)} / ${formatPerf(
          totals.invested !== 0 ? (totals.profit / totals.invested) * 100 : null,
        )}).`
      : `Invested ${money(totals.invested)}. Some last prices are still missing.`;
  const taxLine =
    totals.tax != null
      ? ` Educational 15% on net gain ≈ ${money(totals.tax)} (not a tax filing).`
      : "";
  const incomplete = totals.incomplete
    ? " One or more lots have no live quote yet."
    : "";

  const textSections = grouped.map((section) => {
    const lots = section.rows
      .map((row) => `• ${lotLine(row)}\n  ${row.status.action.hint}`)
      .join("\n");
    return `${section.title.toUpperCase()}\n${lots}`;
  });

  const text = [
    `Atlas wallet briefing — ${dateLabel}`,
    "",
    `${pnlLine}${taxLine}${incomplete}`,
    "",
    ...textSections,
    "",
    "This is an educational briefing from Atlas, not regulated investment advice.",
    `Open My Wallet: ${input.walletUrl}`,
  ].join("\n");

  const htmlRows = grouped
    .map((section) => {
      const lots = section.rows
        .map((row) => {
          const pnl =
            row.status.pnlPct != null ? formatPerf(row.status.pnlPct) : "—";
          const last = row.last != null ? formatPrice(row.last) : "—";
          return `<tr>
  <td style="padding:8px 0;border-bottom:1px solid #e4e4e7;font-family:ui-monospace,Menlo,monospace;font-size:13px;color:#111">${escapeHtml(row.symbol)}</td>
  <td style="padding:8px 0;border-bottom:1px solid #e4e4e7;font-size:13px;color:#111">${escapeHtml(row.status.action.label)}</td>
  <td style="padding:8px 0;border-bottom:1px solid #e4e4e7;font-size:13px;color:#111;text-align:right">${escapeHtml(last)}</td>
  <td style="padding:8px 0;border-bottom:1px solid #e4e4e7;font-size:13px;color:#111;text-align:right">${escapeHtml(pnl)}</td>
</tr>
<tr>
  <td colspan="4" style="padding:0 0 12px;font-size:12px;color:#71717a">${escapeHtml(row.status.action.hint)}</td>
</tr>`;
        })
        .join("");
      return `<h2 style="margin:24px 0 8px;font-size:14px;letter-spacing:0.04em;text-transform:uppercase;color:#3f3f46">${escapeHtml(section.title)}</h2>
<table width="100%" cellpadding="0" cellspacing="0">${lots}</table>`;
    })
    .join("");

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#fafafa;color:#111;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:24px">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#a16207">Atlas</p>
    <h1 style="margin:0 0 8px;font-size:20px">Wallet briefing</h1>
    <p style="margin:0 0 16px;font-size:13px;color:#71717a">${escapeHtml(dateLabel)}</p>
    <p style="margin:0 0 8px;font-size:14px;line-height:1.5">${escapeHtml(pnlLine)}</p>
    <p style="margin:0;font-size:13px;color:#71717a;line-height:1.5">${escapeHtml((taxLine + incomplete).trim())}</p>
    ${htmlRows}
    <p style="margin:24px 0 0;font-size:12px;color:#71717a;line-height:1.5">This is an educational briefing from Atlas, not regulated investment advice.</p>
    <p style="margin:12px 0 0"><a href="${escapeHtml(input.walletUrl)}" style="color:#a16207">Open My Wallet</a></p>
  </div>
</body>
</html>`;

  return {
    subject: subjectLine(input.holdings),
    text,
    html,
    decisionItems: decisionItems(input.holdings),
  };
}

export function walletAppUrl(): string {
  const base = (
    process.env.AUTH_URL?.trim() ||
    "https://financial-advisor-sable.vercel.app"
  ).replace(/\/$/, "");
  return `${base}/wallet`;
}
