/** Inferência visual (logo + bandeira) para símbolos do catálogo. */

const EXCHANGE_COUNTRY: Record<string, string> = {
  "NYSE Arca": "us",
  NYSE: "us",
  NASDAQ: "us",
  CBOE: "us",
  CME: "us",
  BMFBOVESPA: "br",
  LSE: "gb",
  XETRA: "de",
  Euronext: "eu",
  HKEX: "hk",
  TSE: "jp",
  OANDA: "us",
};

const FX_COUNTRY: Record<string, string> = {
  FXE: "eu",
  FXB: "gb",
  FXY: "jp",
  FXC: "ca",
  FXA: "au",
  UUP: "us",
  USDU: "us",
  CEW: "us",
};

const CLASS_DEFAULT_COUNTRY: Record<string, string> = {
  us_equity: "us",
  fi_treasury: "us",
  fi_ig: "us",
  fi_hy: "us",
  fi_tips: "us",
  fi_preferred: "us",
  cash_equivalents: "us",
  intl_equity: "eu",
  em_equity: "em",
  real_estate: "us",
  commodities_precious: "us",
  commodities_energy: "us",
  energy_mlp: "us",
  healthcare_biotech: "us",
  alt_bdc: "us",
  alt_infrastructure: "us",
  currencies: "us",
};

export function inferCountryCode(
  symbol: string,
  exchange: string,
  classId: string,
): string | null {
  const sym = symbol.toUpperCase();
  if (FX_COUNTRY[sym]) return FX_COUNTRY[sym];
  if (sym.endsWith("11") || exchange.toUpperCase().includes("BMF")) return "br";
  if (EXCHANGE_COUNTRY[exchange]) return EXCHANGE_COUNTRY[exchange];
  for (const [key, code] of Object.entries(EXCHANGE_COUNTRY)) {
    if (exchange.toUpperCase().includes(key.toUpperCase())) return code;
  }
  return CLASS_DEFAULT_COUNTRY[classId] ?? "us";
}

/** URL pública de logo por ticker (FMP). Fallback no componente se 404. */
export function symbolLogoUrl(symbol: string): string {
  const sym = symbol.toUpperCase().replace(/\./g, "-");
  return `https://financialmodelingprep.com/image-stock/${encodeURIComponent(sym)}.png`;
}

export function flagUrl(countryCode: string): string {
  const code =
    countryCode === "em" ? "un" : countryCode.toLowerCase().slice(0, 2);
  return `https://flagcdn.com/w40/${code}.png`;
}
