import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { WatchlistClassGroup, WatchlistRow } from "@/lib/motor/snapshot-types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
}));
vi.mock("@/components/home/WatchlistStarButton", () => ({
  WatchlistStarButton: () => null,
}));
vi.mock("@/components/catalog/SymbolAvatar", () => ({
  SymbolAvatar: () => null,
}));

const { WatchlistClassTable } = await import(
  "@/components/home/WatchlistClassTable"
);

function row(overrides: Partial<WatchlistRow> = {}): WatchlistRow {
  return {
    id: "1",
    symbol: "SGOV",
    classId: "cash_equivalents",
    name: "iShares 0-3 Month Treasury Bond ETF",
    exchange: "NYSE",
    kind: "etf",
    score: 0.46,
    stageLabel: "Hold",
    stage: "Maduro",
    divergesFromClass: false,
    entryValidated: false,
    entryTiming: "Avoid",
    instrumentQuality: "Competitive",
    dominantIndicator: { id: "vol", name: "Volume vs média", contribution: 0.2 },
    rationale: [],
    perf1dPct: 0.01,
    perf7dPct: 0.11,
    perf15dPct: 0.22,
    perf1mPct: null,
    avgVolumeShares: 20_000_000,
    volumeSharePct: 38,
    indicators: [{ id: "vol", name: "Volume vs média", value: 0.087 }],
    hasMotorData: true,
    motorScope: "ticker",
    ...overrides,
  };
}

function group(rows: WatchlistRow[]): WatchlistClassGroup {
  return {
    classId: "cash_equivalents",
    label: "Cash",
    classScore: 0.12,
    classStageLabel: "Strong Reduce",
    classEntryValidated: false,
    classDominantIndicator: null,
    classIndicators: [],
    rows,
  };
}

function countTags(html: string, tag: "th" | "td"): number {
  return html.match(new RegExp(`<${tag}[\\s>]`, "g"))?.length ?? 0;
}

describe("WatchlistClassTable", () => {
  it("gives every header exactly one cell underneath it", () => {
    const html = renderToStaticMarkup(
      <WatchlistClassTable group={group([row()])} />,
    );
    expect(countTags(html, "th")).toBe(countTags(html, "td"));
  });

  it("keeps headers and cells aligned as indicator columns come and go", () => {
    for (const indicators of [
      [],
      [{ id: "a", name: "A", value: 1 }],
      [
        { id: "a", name: "A", value: 1 },
        { id: "b", name: "B", value: 2 },
        { id: "c", name: "C", value: 3 },
      ],
    ]) {
      const html = renderToStaticMarkup(
        <WatchlistClassTable group={group([row({ indicators })])} />,
      );
      expect(countTags(html, "th")).toBe(countTags(html, "td"));
    }
  });

  it("shows volume with its class share, next to the score", () => {
    const html = renderToStaticMarkup(
      <WatchlistClassTable group={group([row()])} />,
    );
    expect(html).toContain("20M");
    expect(html).toContain("38% of class");
    expect(html.indexOf("Score")).toBeLessThan(html.indexOf("Volume 15d"));
  });

  it("labels decisions in plain language instead of model jargon", () => {
    const html = renderToStaticMarkup(
      <WatchlistClassTable group={group([row()])} />,
    );
    expect(html).toContain("Hold");
    expect(html).toContain("Do not add");
    expect(html).not.toContain("Not validated");
    expect(html).not.toContain(">Stage<");
  });
});
