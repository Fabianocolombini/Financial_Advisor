import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { CATALOG_INSTRUMENTS, getCatalogByClass, getCatalogInstrumentsByClass } from "./instruments";
import { rankCatalogByVolume } from "./volume-rank";
import type { CatalogInstrument, CatalogSearchResult } from "./types";

function assetTypeToKind(assetType: string): string {
  switch (assetType) {
    case "ETF":
      return "etf";
    case "EQUITY":
      return "stock";
    case "COMMODITY":
      return "commodity";
    case "INDEX":
      return "index";
    default:
      return "other";
  }
}

function matchesQuery(item: CatalogInstrument, q: string): boolean {
  const needle = q.trim().toUpperCase();
  if (!needle) return true;
  return (
    item.symbol.toUpperCase().includes(needle) ||
    item.name.toUpperCase().includes(needle)
  );
}

function catalogToResult(
  item: CatalogInstrument,
  watchlistSymbols: Set<string>,
): CatalogSearchResult {
  return {
    ...item,
    source: "catalog",
    inWatchlist: watchlistSymbols.has(item.symbol.toUpperCase()),
  };
}

async function searchDatabase(
  q: string,
  watchlistSymbols: Set<string>,
): Promise<CatalogSearchResult[]> {
  const needle = q.trim();
  if (!needle) return [];

  const catalogSymbols = new Set(
    CATALOG_INSTRUMENTS.map((i) => i.symbol.toUpperCase()),
  );

  const bySymbol = await prisma.qiAsset.findMany({
    where: {
      isActive: true,
      OR: [
        { symbol: { contains: needle, mode: "insensitive" } },
        { name: { contains: needle, mode: "insensitive" } },
      ],
    },
    take: 30,
  });

  const byIdentifier = await prisma.qiAssetIdentifier.findMany({
    where: {
      value: { contains: needle, mode: "insensitive" },
      idType: { in: ["ISIN", "CUSIP"] },
    },
    include: { asset: true },
    take: 20,
  });

  const assets = [
    ...bySymbol,
    ...byIdentifier
      .map((row) => row.asset)
      .filter((a) => a.isActive),
  ];

  const seen = new Set<string>();
  const results: CatalogSearchResult[] = [];

  for (const asset of assets) {
    const symbol = asset.symbol.toUpperCase();
    if (seen.has(symbol) || catalogSymbols.has(symbol)) continue;
    seen.add(symbol);

    const catalogMatch = CATALOG_INSTRUMENTS.find(
      (c) => c.symbol.toUpperCase() === symbol,
    );

    results.push({
      symbol,
      name: asset.name,
      classId: catalogMatch?.classId ?? "unclassified",
      exchange: asset.exchangeMic ?? "—",
      kind: catalogMatch?.kind ?? assetTypeToKind(asset.assetType),
      source: "database",
      inWatchlist: watchlistSymbols.has(symbol),
    });
  }

  return results;
}

const rankCatalogByVolumeCached = unstable_cache(
  async (classId: string, sector?: string) => {
    let instruments = getCatalogInstrumentsByClass(classId);
    if (sector && sector !== "all") {
      instruments = instruments.filter((item) => item.sector === sector);
    }
    return rankCatalogByVolume(instruments);
  },
  ["catalog-volume-rank"],
  { revalidate: 3600 },
);

export async function searchCatalog(options: {
  q?: string;
  classId?: string;
  sector?: string;
  watchlistSymbols?: Set<string>;
  limit?: number;
}): Promise<CatalogSearchResult[]> {
  const {
    q = "",
    classId = "all",
    sector = "all",
    watchlistSymbols = new Set<string>(),
    limit = 30,
  } = options;

  const query = q.trim();

  if (!query) {
    if (classId !== "all") {
      const ranked = await rankCatalogByVolumeCached(classId, sector);
      return ranked.map((item) => ({
        ...catalogToResult(item, watchlistSymbols),
        liquiditySharePct: item.liquiditySharePct,
      }));
    }
    const curated = getCatalogByClass(classId, limit);
    return curated.map((item) => catalogToResult(item, watchlistSymbols));
  }

  const catalogHits = CATALOG_INSTRUMENTS.filter((item) => {
    if (classId !== "all" && item.classId !== classId) return false;
    if (sector !== "all" && item.sector !== sector) return false;
    return matchesQuery(item, query);
  }).slice(0, limit);

  const dbHits = await searchDatabase(query, watchlistSymbols);
  const filteredDb =
    classId === "all"
      ? dbHits
      : dbHits.filter((h) => h.classId === classId || h.classId === "unclassified");

  const catalogResults = catalogHits.map((item) =>
    catalogToResult(item, watchlistSymbols),
  );

  const merged: CatalogSearchResult[] = [];
  const seen = new Set<string>();

  for (const item of [...catalogResults, ...filteredDb]) {
    const key = item.symbol.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({
      ...item,
      symbol: key,
      inWatchlist: watchlistSymbols.has(key),
    });
    if (merged.length >= limit) break;
  }

  return merged;
}
