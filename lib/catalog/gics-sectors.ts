/** GICS sector labels for US equity catalog filtering. */
export const GICS_SECTORS = [
  "Information Technology",
  "Financials",
  "Health Care",
  "Consumer Discretionary",
  "Consumer Staples",
  "Industrials",
  "Energy",
  "Materials",
  "Utilities",
  "Real Estate",
  "Communication Services",
] as const;

export type GicsSector = (typeof GICS_SECTORS)[number];

export const GICS_SECTOR_ALL = "all";
