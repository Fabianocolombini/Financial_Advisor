import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";

import { fetchYahooChartCloses } from "@/lib/market/yahoo";
import {
  BENCHMARK_SYMBOL,
  priceUniverseSymbols,
  SECTOR_ETFS,
} from "@/lib/qi/constants";
import { utcDateOnly } from "@/lib/qi/regime-engine";
import { prisma } from "@/lib/prisma";

const ETF_SYMBOLS = new Set<string>(SECTOR_ETFS.map((s) => s.symbol));

const ETF_NAMES: Record<string, string> = Object.fromEntries(
  SECTOR_ETFS.map((s) => [s.symbol, s.label]),
);

function displayName(symbol: string): string {
  if (symbol === BENCHMARK_SYMBOL) return "SPDR S&P 500 ETF";
  return ETF_NAMES[symbol] ?? symbol;
}

function sectorLabelForSymbol(symbol: string): string | null {
  return ETF_NAMES[symbol] ?? null;
}

export type IngestQiPricesResult = {
  symbolsProcessed: number;
  barsUpserted: number;
  errors: string[];
};

/**
 * Yahoo → `QiAsset` + `QiMarketPriceDaily` (YFINANCE).
 */
export async function ingestQiPrices(): Promise<IngestQiPricesResult> {
  const symbols = priceUniverseSymbols();
  const errors: string[] = [];
  let barsUpserted = 0;
  const period2Sec = Math.floor(Date.now() / 1000);
  const period1Sec = period2Sec - 400 * 24 * 3600;

  for (const sym of symbols) {
    try {
      const asset = await prisma.qiAsset.upsert({
        where: { symbol: sym },
        create: {
          symbol: sym,
          assetType:
            sym === BENCHMARK_SYMBOL || ETF_SYMBOLS.has(sym)
              ? "ETF"
              : "EQUITY",
          name: displayName(sym),
          currency: "USD",
          gicsSector: sectorLabelForSymbol(sym),
        },
        update: {
          name: displayName(sym),
          gicsSector: sectorLabelForSymbol(sym) ?? undefined,
        },
      });

      const bars = await fetchYahooChartCloses(sym, period1Sec, period2Sec);
      if (bars.length === 0) {
        errors.push(`${sym}: sem barras Yahoo`);
        continue;
      }

      for (const b of bars) {
        const tradeDate = utcDateOnly(new Date(b.date));
        const close = new Prisma.Decimal(b.value);
        await prisma.qiMarketPriceDaily.upsert({
          where: {
            assetId_tradeDate_source: {
              assetId: asset.id,
              tradeDate,
              source: "YFINANCE",
            },
          },
          create: {
            id: randomUUID(),
            assetId: asset.id,
            tradeDate,
            open: close,
            high: close,
            low: close,
            close,
            volume: BigInt(0),
            adjustedClose: close,
            source: "YFINANCE",
          },
          update: {
            open: close,
            high: close,
            low: close,
            close,
            adjustedClose: close,
          },
        });
        barsUpserted += 1;
      }
    } catch (e) {
      errors.push(
        `${sym}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return {
    symbolsProcessed: symbols.length,
    barsUpserted,
    errors,
  };
}
