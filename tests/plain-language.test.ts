import { describe, expect, it } from "vitest";
import {
  plainNewMoney,
  plainQuality,
  plainTrend,
} from "@/lib/motor/plain-language";

describe("plainTrend", () => {
  it("maps every stage the motor can emit, in English or Portuguese", () => {
    expect(plainTrend("Accumulate").label).toBe("Aumentar");
    expect(plainTrend("Ascendente").label).toBe("Aumentar");
    expect(plainTrend("Hold").label).toBe("Manter");
    expect(plainTrend("Maduro").label).toBe("Manter");
    expect(plainTrend("Reduce").label).toBe("Reduzir");
    expect(plainTrend("Descendente").label).toBe("Reduzir");
    expect(plainTrend("Strong Reduce").label).toBe("Reduzir forte");
    expect(plainTrend("ForteDescendente").label).toBe("Reduzir forte");
  });

  it("falls back to an explicit no-data label instead of a wrong verdict", () => {
    expect(plainTrend("Analyzing").tone).toBe("unknown");
    expect(plainTrend(null).tone).toBe("unknown");
  });

  it("says Reduzir is about direction, not past losses", () => {
    expect(plainTrend("Reduce").hint).toContain("Não significa que já deu prejuízo");
  });
});

describe("plainNewMoney", () => {
  const base = { entryValidated: true, hasMotorData: true } as const;

  it("prefers entryTiming over the legacy boolean", () => {
    expect(plainNewMoney({ ...base, entryTiming: "Avoid" }).label).toBe(
      "Não aportar",
    );
    expect(plainNewMoney({ ...base, entryTiming: "Buy" }).label).toBe(
      "Pode aportar",
    );
    expect(plainNewMoney({ ...base, entryTiming: "Wait" }).label).toBe("Esperar");
  });

  it("treats cash as timing-free rather than as a buy signal", () => {
    const cash = plainNewMoney({ ...base, entryTiming: "Neutral" });
    expect(cash.label).toBe("Indiferente");
    expect(cash.tone).toBe("neutral");
  });

  it("falls back to the boolean on older snapshots", () => {
    expect(plainNewMoney({ ...base, entryTiming: null }).label).toBe(
      "Pode aportar",
    );
    expect(
      plainNewMoney({ entryValidated: false, hasMotorData: true }).label,
    ).toBe("Não aportar");
  });

  it("flags class-scope rows as evaluated by the class, not the instrument", () => {
    const row = plainNewMoney({
      entryValidated: true,
      hasMotorData: true,
      motorScope: "class",
    });
    expect(row.hint).toContain("pela classe");
  });

  it("never claims a verdict without motor data", () => {
    expect(
      plainNewMoney({ entryValidated: true, hasMotorData: false }).label,
    ).toBe("Sem dados");
  });

  it("never promises a return", () => {
    for (const timing of ["Buy", "Wait", "Avoid", "Neutral"]) {
      expect(plainNewMoney({ ...base, entryTiming: timing }).hint).not.toMatch(
        /vai (subir|render)/i,
      );
    }
  });
});

describe("plainQuality", () => {
  it("names the band the motor assigned", () => {
    expect(plainQuality({ instrumentQuality: "Preferred", score: 0.8 }).label).toBe(
      "Entre os melhores",
    );
    expect(plainQuality({ instrumentQuality: "Weak", score: 0.1 }).label).toBe(
      "Entre os piores",
    );
  });

  it("derives a band from the score when the snapshot predates the field", () => {
    expect(plainQuality({ score: 0.62 }).label).toBe("Acima da mediana");
    expect(plainQuality({ score: 0.31 }).label).toBe("Abaixo da mediana");
    expect(plainQuality({ score: null }).label).toBe("—");
  });
});
