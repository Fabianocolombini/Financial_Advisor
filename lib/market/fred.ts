export type FredObservation = {
  date: string;
  value: number;
  raw: { date: string; value: string };
};

type FredObservationsResponse = {
  observations?: { date: string; value: string }[];
};

function formatYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Busca observações FRED a partir de observation_start (YYYY-MM-DD).
 * https://fred.stlouisfed.org/docs/api/fred/series_observations.html
 */
export async function fetchFredObservations(
  apiKey: string,
  seriesId: string,
  observationStart: string,
): Promise<FredObservation[]> {
  const url = new URL("https://api.stlouisfed.org/fred/series/observations");
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("observation_start", observationStart);
  url.searchParams.set("sort_order", "asc");

  const res = await fetch(url.toString(), {
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FRED HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as FredObservationsResponse;
  const obs = json.observations ?? [];
  const out: FredObservation[] = [];

  for (const row of obs) {
    if (row.value === "." || row.value === "") continue;
    const n = Number.parseFloat(row.value);
    if (!Number.isFinite(n)) continue;
    out.push({ date: row.date, value: n, raw: { date: row.date, value: row.value } });
  }

  return out;
}

export function nextCalendarDayUtc(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return formatYmd(d);
}
