/** Versão do modelo (alinhar com `analytics/qi` quando aplicável). */
export const QI_MODEL_VERSION =
  process.env.QI_MODEL_VERSION?.trim() || "v0.1.0";

export const BENCHMARK_SYMBOL = "SPY";

export const SECTOR_ETFS = [
  { symbol: "XLK", sectorCode: "XLK", label: "Tecnologia" },
  { symbol: "XLF", sectorCode: "XLF", label: "Financeiro" },
  { symbol: "XLV", sectorCode: "XLV", label: "Saúde" },
  { symbol: "XLE", sectorCode: "XLE", label: "Energia" },
  { symbol: "XLI", sectorCode: "XLI", label: "Industrial" },
  { symbol: "XLP", sectorCode: "XLP", label: "Consumo básico" },
  { symbol: "XLY", sectorCode: "XLY", label: "Consumo discricionário" },
  { symbol: "XLU", sectorCode: "XLU", label: "Utilidades" },
  { symbol: "XLRE", sectorCode: "XLRE", label: "Imobiliário" },
  { symbol: "XLB", sectorCode: "XLB", label: "Materiais" },
  { symbol: "XLC", sectorCode: "XLC", label: "Comunicação" },
] as const;

/** Candidatos por ETF sector (amostra; expandir conforme universo). */
export const SECTOR_CANDIDATES: Record<string, readonly string[]> = {
  XLK: ["AAPL", "MSFT", "NVDA"],
  XLF: ["JPM", "BAC", "GS"],
  XLV: ["UNH", "JNJ", "LLY"],
  XLE: ["XOM", "CVX", "COP"],
  XLI: ["CAT", "DE", "HON"],
  XLP: ["PG", "KO", "WMT"],
  XLY: ["AMZN", "TSLA", "HD"],
  XLU: ["NEE", "DUK", "SO"],
  XLRE: ["PLD", "AMT", "EQIX"],
  XLB: ["LIN", "APD", "ECL"],
  XLC: ["GOOGL", "META", "NFLX"],
};

export function priceUniverseSymbols(): string[] {
  const fromSectors = SECTOR_ETFS.map((s) => s.symbol);
  const fromCandidates = Object.values(SECTOR_CANDIDATES).flat();
  return [...new Set([BENCHMARK_SYMBOL, ...fromSectors, ...fromCandidates])];
}

export const RISK_PROFILE = {
  maxSingleName: 0.35,
  minWeight: 0.1,
  topSectors: 3,
} as const;

export const RISK_FILTERS = {
  minLastClose: 5,
  minHistoryDays: 60,
} as const;
