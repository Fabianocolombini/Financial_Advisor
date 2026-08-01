export type CatalogInstrument = {
  symbol: string;
  name: string;
  classId: string;
  exchange: string;
  kind: string;
};

export type AssetClassTab = {
  id: string;
  label: string;
};

export type CatalogSearchResult = CatalogInstrument & {
  source: "catalog" | "database";
  inWatchlist?: boolean;
  /** Share of class avg daily dollar volume (browse-by-class only). */
  liquiditySharePct?: number | null;
};
