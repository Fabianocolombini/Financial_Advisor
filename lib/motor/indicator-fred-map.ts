/** Indicator id → FRED series for historical charts on detail (free API). */
export const INDICATOR_FRED_SERIES: Record<string, string> = {
  t10y2y: "T10Y2Y",
  spread_10y_2y: "T10Y2Y",
  t10y3m: "T10Y3M",
  spread_10y_3m: "T10Y3M",
  dff: "DFF",
  fed_funds: "DFF",
  yield_10y: "DGS10",
  dgs10: "DGS10",
  dtb3: "DTB3",
  vix: "VIXCLS",
  ig_oas: "BAMLC0A0CM",
  hy_oas: "BAMLH0A0HYM2",
  hy_ccc: "BAMLH0A3HYC",
  t10yie: "T10YIE",
  t5yie: "T5YIE",
  breakeven_5y5y: "T5YIFR",
  dfii10: "DFII10",
  dfii5: "DFII5",
  dfii30: "DFII30",
  cpi: "CPIAUCSL",
  dxy: "DTWEXBGS",
  eurusd: "DEXUSEU",
  wti: "DCOILWTICO",
  henry_hub: "DHHNGSP",
  crude_oil_stocks: "WCESTUS1",
  loan_officer: "DRALACBS",
};

export function fredSeriesForIndicator(indicatorId: string): string | null {
  return INDICATOR_FRED_SERIES[indicatorId] ?? null;
}
