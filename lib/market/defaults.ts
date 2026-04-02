import type { MarketDataProvider } from "@prisma/client";

export type DefaultSeriesConfig = {
  provider: MarketDataProvider;
  externalId: string;
  displayName: string;
};

/** Séries MVP — amplie via código ou futura tabela de config. */
export const DEFAULT_MARKET_SERIES: DefaultSeriesConfig[] = [
  {
    provider: "FRED",
    externalId: "DFF",
    displayName: "Federal Funds Effective Rate",
  },
  {
    provider: "YFINANCE",
    externalId: "SPY",
    displayName: "SPDR S&P 500 ETF (fechamento)",
  },
];

/** Primeira carga histórica se a série estiver vazia. */
export const MARKET_BACKFILL_START = "2019-01-01";
