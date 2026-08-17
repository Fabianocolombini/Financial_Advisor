import { describe, expect, it } from "vitest";
import { MOTOR_CLASS_IDS } from "@/lib/catalog/asset-classes";
import {
  findRecipeIndicator,
  indicatorStance,
  scoringPercentile,
} from "@/lib/motor/indicator-stance";
import { scoreRecipeFor, type ScoreIngredient } from "@/lib/motor/score-recipes";
import type { MotorIndicatorSnapshot } from "@/lib/motor/snapshot-types";

describe("indicatorStance", () => {
  it("bands the directed percentile so 0.5 is Neutral, not a failure", () => {
    expect(indicatorStance(0.8).kind).toBe("helping");
    expect(indicatorStance(0.5).kind).toBe("neutral");
    expect(indicatorStance(0.2).kind).toBe("dragging");
    expect(indicatorStance(null).kind).toBe("unknown");
  });

  it("uses 0.65 / 0.35 as the edges", () => {
    expect(indicatorStance(0.65).kind).toBe("helping");
    expect(indicatorStance(0.649).kind).toBe("neutral");
    expect(indicatorStance(0.35).kind).toBe("neutral");
    expect(indicatorStance(0.349).kind).toBe("dragging");
  });
});

describe("scoringPercentile", () => {
  it("prefers the exported percentile over the raw value", () => {
    const ind: MotorIndicatorSnapshot = {
      id: "vol_realizada",
      name: "σ20",
      value: 0,
      percentile: 0.72,
      weight: 0.35,
      contribution: 0.252,
    };
    expect(scoringPercentile(ind)).toBe(0.72);
  });

  it("recovers the rank from contribution / weight on older snapshots", () => {
    const ind: MotorIndicatorSnapshot = {
      id: "volume_negociado",
      name: "Volume",
      value: 5_700_000,
      contribution: 0.4,
    };
    expect(scoringPercentile(ind, 0.5)).toBe(0.8);
  });
});

describe("score recipes", () => {
  it("covers every Markets tab with ids, short labels, and weights that sum to 1", () => {
    for (const classId of MOTOR_CLASS_IDS) {
      const recipe = scoreRecipeFor(classId);
      expect(recipe, classId).toBeTruthy();
      const sum = recipe!.ingredients.reduce((acc, ing) => acc + ing.weight, 0);
      expect(sum, classId).toBeCloseTo(1, 5);
      for (const ing of recipe!.ingredients) {
        expect(ing.id, `${classId} missing id`).toBeTruthy();
        expect(ing.shortLabel, `${classId} missing shortLabel`).toBeTruthy();
      }
    }
  });
});

describe("findRecipeIndicator", () => {
  it("matches older snapshot ids via aliases", () => {
    const ingredient: ScoreIngredient = {
      id: "volume_negociado",
      shortLabel: "Volume",
      label: "Traded volume",
      weight: 0.5,
      meaning: "liquidity",
      aliases: ["volume_vs_media"],
    };
    const rows: MotorIndicatorSnapshot[] = [
      { id: "volume_vs_media", name: "Volume vs média", value: 0.26 },
    ];
    expect(findRecipeIndicator(rows, ingredient)?.id).toBe("volume_vs_media");
  });
});
