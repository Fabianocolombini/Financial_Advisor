/**
 * Wallet book totals. Tax is an educational 15% on net profit only
 * (typical BR PF rate on offshore financial gains / capital gains).
 * Losses are not taxed. This is not a tax filing.
 */

export const WALLET_GAIN_TAX_RATE = 0.15;

export type WalletLotForSummary = {
  status: {
    costValue: number;
    marketValue: number | null;
  };
};

export type WalletSummary = {
  /** What you paid for every lot, including names still without a live quote. */
  invested: number;
  /** What you paid for lots that have a live quote. */
  quotedCost: number;
  /** Market value of quoted lots only. */
  gross: number | null;
  profit: number | null;
  tax: number | null;
  net: number | null;
  taxRate: number;
  quotedLots: number;
  totalLots: number;
  incomplete: boolean;
};

export function summarizeWallet(
  holdings: WalletLotForSummary[],
  taxRate = WALLET_GAIN_TAX_RATE,
): WalletSummary {
  const invested = holdings.reduce((sum, row) => sum + row.status.costValue, 0);
  const quoted = holdings.filter((row) => row.status.marketValue != null);
  if (quoted.length === 0) {
    return {
      invested,
      quotedCost: 0,
      gross: null,
      profit: null,
      tax: null,
      net: null,
      taxRate,
      quotedLots: 0,
      totalLots: holdings.length,
      incomplete: holdings.length > 0,
    };
  }

  const quotedCost = quoted.reduce((sum, row) => sum + row.status.costValue, 0);
  const gross = quoted.reduce((sum, row) => sum + (row.status.marketValue ?? 0), 0);
  const profit = gross - quotedCost;
  const tax = Math.max(0, profit) * taxRate;
  const net = gross - tax;

  return {
    invested,
    quotedCost,
    gross,
    profit,
    tax,
    net,
    taxRate,
    quotedLots: quoted.length,
    totalLots: holdings.length,
    incomplete: quoted.length !== holdings.length,
  };
}
