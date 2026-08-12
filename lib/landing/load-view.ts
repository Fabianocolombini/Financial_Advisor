import { loadMotorDashboardSnapshot } from "@/lib/motor/load-snapshot";
import { fetchYahooQuoteSummaryCached } from "@/lib/market/yahoo-quote";
import { LANDING_INDICES } from "./taxonomy";
import { buildLandingBook, type LandingIndexRow, type LandingViewModel } from "./build-view";

export async function loadLandingView(): Promise<LandingViewModel> {
  const snapshot = await loadMotorDashboardSnapshot();
  const { classes, tape, top10 } = buildLandingBook(snapshot);

  const indices: LandingIndexRow[] = await Promise.all(
    LANDING_INDICES.map(async (row) => {
      try {
        const quote = await fetchYahooQuoteSummaryCached(row.symbol);
        const change =
          quote.changePercent != null && Number.isFinite(quote.changePercent)
            ? quote.changePercent
            : null;
        return {
          id: row.id,
          label: row.label,
          symbol: row.symbol,
          changePercent: change,
        };
      } catch {
        return {
          id: row.id,
          label: row.label,
          symbol: row.symbol,
          changePercent: null,
        };
      }
    }),
  );

  const indexTape = indices
    .filter((row) => row.changePercent != null)
    .map((row) => ({
      symbol: row.label,
      name: row.label,
      classId: "index",
      classLabel: "Index",
      changePercent: row.changePercent,
    }));

  return {
    asOf: snapshot?.asOf ?? null,
    indices,
    tape: [...indexTape, ...tape],
    classes,
    top10,
  };
}
