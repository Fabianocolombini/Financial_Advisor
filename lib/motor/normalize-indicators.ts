import type { MotorIndicatorSnapshot } from "./snapshot-types";

type RawIndicator = MotorIndicatorSnapshot & Record<string, unknown>;

/** Resolve display value from motor component fields (valor, percentile_cs, z_score, …). */
export function resolveIndicatorValue(raw: RawIndicator): number | null {
  if (raw.value != null && !Number.isNaN(Number(raw.value))) {
    return Number(raw.value);
  }
  for (const key of [
    "valor",
    "percentile_cs",
    "percentile_0_1",
    "signal_0_1",
    "penalty_0_1",
    "z_score",
    "zScore",
    "hedge_fit",
    "cape_cheap",
    "er_contrib_0_1",
    "pc_contra",
    "aaii_contra",
    "naaim_contra",
  ]) {
    const v = raw[key];
    if (typeof v === "number" && !Number.isNaN(v)) return v;
  }
  return null;
}

export function normalizeIndicatorSnapshot(
  raw: RawIndicator,
): MotorIndicatorSnapshot {
  const value = resolveIndicatorValue(raw);
  return {
    id: String(raw.id),
    name: String(raw.name ?? raw.nome ?? raw.id),
    value,
    zScore:
      typeof raw.zScore === "number"
        ? raw.zScore
        : typeof raw.z_score === "number"
          ? raw.z_score
          : null,
    contribution:
      typeof raw.contribution === "number"
        ? raw.contribution
        : typeof raw.contribuicao === "number"
          ? raw.contribuicao
          : null,
    isProxy: Boolean(raw.isProxy ?? raw.is_proxy),
    proxyRationale:
      typeof raw.proxyRationale === "string"
        ? raw.proxyRationale
        : typeof raw.proxy_rationale === "string"
          ? raw.proxy_rationale
          : undefined,
  };
}

export function mergeIndicatorPools(
  pools: Array<MotorIndicatorSnapshot[] | undefined | null>,
): MotorIndicatorSnapshot[] {
  const byId = new Map<string, MotorIndicatorSnapshot>();
  for (const pool of pools) {
    if (!pool) continue;
    for (const ind of pool) {
      const norm = normalizeIndicatorSnapshot(ind as RawIndicator);
      const prev = byId.get(norm.id);
      if (!prev || (prev.value == null && norm.value != null)) {
        byId.set(norm.id, norm);
      }
    }
  }
  return [...byId.values()];
}

export function regimeComponentsToIndicators(
  components: Array<Record<string, unknown>> | undefined,
): MotorIndicatorSnapshot[] {
  if (!components?.length) return [];
  return components.map((c) => normalizeIndicatorSnapshot(c as RawIndicator));
}
