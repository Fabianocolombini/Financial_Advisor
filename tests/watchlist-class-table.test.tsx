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

function scoredCashRow(): WatchlistRow {
  return row({
    symbol: "CLOZ",
    score: 0.563,
    indicators: [
      {
        id: "volume_negociado",
        name: "Volume negociado",
        value: 5_700_000,
        percentile: 0.8,
        weight: 0.5,
        contribution: 0.4,
      },
      {
        id: "vol_realizada",
        name: "Vol realizada 20d",
        value: 0,
        percentile: 0.2,
        weight: 0.35,
        contribution: 0.07,
      },
      {
        id: "preco_vs_mm50_z_abs",
        name: "|Preço vs MM50|",
        value: 1.82,
        percentile: 0.5,
        weight: 0.15,
        contribution: 0.075,
      },
    ],
  });
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

  it("keeps the Cash V2 recipe columns even when a row is missing pillars", () => {
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
      expect(html).toContain("σ20");
      expect(html).toContain("|Δ50z|");
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

  it("prints the V2 weights and a stance chip next to each pillar rank", () => {
    const html = renderToStaticMarkup(
      <WatchlistClassTable group={group([scoredCashRow()])} />,
    );
    expect(html).toContain("Score mix");
    expect(html).toContain("50%");
    expect(html).toContain("Helping");
    expect(html).toContain("Dragging");
    expect(html).toContain("Neutral");
    expect(html).toContain("0.80");
    expect(html).not.toContain("1.820");
  });

  it("quantifies new money as Gain vs Risk without dropping the motor badge", () => {
    const html = renderToStaticMarkup(
      <WatchlistClassTable group={group([scoredCashRow()])} />,
    );
    expect(html).toContain("Gain 56");
    expect(html).toContain("Risk");
    expect(html).toContain("Do not add");
    expect(html).toContain("Name trend");
  });
});
