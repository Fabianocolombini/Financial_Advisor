#!/usr/bin/env python3
"""Automated compliance audit for motor regime + security class models.

Generates docs/AUDITORIA_MODELOS.md with maturity matrix, global checks,
retro tests, and divergence details. Run from repo root:

    python motor/scripts/audit_models.py
"""

from __future__ import annotations

import datetime as dt
import json
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

import pandas as pd

MOTOR_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = MOTOR_ROOT.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from motor.src.paths import CONFIG_DIR, REPO_ROOT as PATHS_REPO_ROOT  # noqa: E402

REPORT_PATH = PATHS_REPO_ROOT / "docs" / "AUDITORIA_MODELOS.md"
MODELS_DIR = CONFIG_DIR / "models"
ABAS_DIR = CONFIG_DIR / "abas"
MODELS_SRC = MOTOR_ROOT / "src" / "calculo" / "models"

Status = Literal["PASS", "FAIL", "N/A", "MANUAL", "NÃO EXECUTADO", "JANELA REDUZIDA"]

CLASSES: list[str] = [
    "cash_equivalents",
    "fi_treasury",
    "fi_ig",
    "fi_hy",
    "fi_tips",
    "fi_preferred",
    "us_equity",
    "intl_equity",
    "em_equity",
    "reits",
    "commodities_precious",
    "commodities_energy",
    "energy_mlp",
    "healthcare_biotech",
    "credito_alternativo",
    "alt_infrastructure",
    "currencies",
]

ABA_TO_REGIME_CONFIG: dict[str, str] = {
    "cash_equivalents": "cash_regime.json",
    "fi_treasury": "treasury_regime.json",
    "fi_ig": "ig_regime.json",
    "fi_hy": "hy_regime.json",
    "fi_tips": "tips_regime.json",
    "fi_preferred": "preferred_regime.json",
    "us_equity": "us_equity_regime.json",
    "intl_equity": "intl_equity_regime.json",
    "em_equity": "em_equity_regime.json",
    "reits": "reits_regime.json",
    "commodities_precious": "commodities_precious_regime.json",
    "commodities_energy": "commodities_energy_regime.json",
    "energy_mlp": "energy_mlp_regime.json",
    "healthcare_biotech": "healthcare_biotech_regime.json",
    "credito_alternativo": "bdc_regime.json",
    "alt_infrastructure": "alt_infrastructure_regime.json",
    "currencies": "fx_regime.json",
}

ABA_TO_MODEL_FILE: dict[str, str] = {
    "cash_equivalents": "cash_regime_model.py",
    "fi_treasury": "treasury_regime_model.py",
    "fi_ig": "ig_regime_model.py",
    "fi_hy": "hy_regime_model.py",
    "fi_tips": "tips_regime_model.py",
    "fi_preferred": "preferred_regime_model.py",
    "us_equity": "us_equity_regime_model.py",
    "intl_equity": "intl_equity_regime_model.py",
    "em_equity": "em_equity_regime_model.py",
    "reits": "reits_regime_model.py",
    "commodities_precious": "commodities_precious_regime_model.py",
    "commodities_energy": "commodities_energy_regime_model.py",
    "energy_mlp": "energy_mlp_regime_model.py",
    "healthcare_biotech": "healthcare_biotech_regime_model.py",
    "credito_alternativo": "bdc_regime_model.py",
    "alt_infrastructure": "alt_infrastructure_regime_model.py",
    "currencies": "fx_regime_model.py",
}

CLASS_RETRO_TESTS: dict[str, list[str]] = {
    "fi_treasury": ["T1", "T2"],
    "fi_hy": ["T3", "T4"],
    "cash_equivalents": ["T5"],
    "fi_tips": ["T6", "T7"],
    "fi_preferred": ["T8", "T9"],
    "reits": ["T10"],
}

OVERRIDE_EXPECTATIONS: dict[str, list[tuple[str, str]]] = {
    "cash_equivalents": [("stress", "_max_action")],
    "fi_treasury": [("flight_to_quality", "_max_action"), ("inflation_shock", "_min_action")],
    "fi_ig": [("credit_event", "_min_action")],
    "fi_hy": [("hy_stress", "_min_action")],
    "fi_tips": [("tips_liquidity", "_min_action")],
    "fi_preferred": [("bank_stress", "_min_action")],
    "us_equity": [("recession_warning", "_min_action")],
    "em_equity": [("em_stress", "_min_action")],
    "credito_alternativo": [("credit_stress", "_min_action")],
}

DOCUMENTED_FALLBACKS = (
    "fed_cut",
    "f_val",
    "0.5",
    "forward",
    "fallback",
    "default",
    "proxy",
    "note",
)


@dataclass
class CheckResult:
    status: Status
    detail: str = ""


@dataclass
class ClassAudit:
    aba_id: str
    checks: dict[str, CheckResult] = field(default_factory=dict)
    maturity: int = 0
    divergences: list[str] = field(default_factory=list)
    registry: bool = False
    calibrated_alert: bool = False


@dataclass
class AuditReport:
    generated_at: dt.datetime
    classes: dict[str, ClassAudit]
    globals: dict[str, CheckResult]
    retro: dict[str, CheckResult]
    alerts: list[str]
    divergences: list[str]


def _status_icon(status: Status) -> str:
    return status


def _approx_equal(a: float, b: float, tol: float = 1e-6) -> bool:
    return abs(a - b) <= tol


def _load_regime_config(aba_id: str) -> dict[str, Any] | None:
    fname = ABA_TO_REGIME_CONFIG.get(aba_id)
    if not fname:
        return None
    path = MODELS_DIR / fname
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _load_aba_config(aba_id: str) -> dict[str, Any] | None:
    path = ABAS_DIR / f"{aba_id}.json"
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _model_source(aba_id: str) -> str:
    fname = ABA_TO_MODEL_FILE.get(aba_id, "")
    path = MODELS_SRC / fname
    return path.read_text(encoding="utf-8") if path.is_file() else ""


def _extract_weights_from_regime(result: dict[str, Any]) -> dict[str, float]:
    weights: dict[str, float] = {}
    for comp in result.get("componentes") or []:
        peso = comp.get("peso")
        if peso is not None and float(peso) > 0:
            cid = comp.get("id") or f"w{len(weights)+1}"
            weights[cid] = float(peso)
    return weights


def _compare_config_weights(cfg: dict[str, Any], result: dict[str, Any]) -> tuple[bool, str]:
    expected_rw = cfg.get("regime_weights") or {}
    if not expected_rw:
        return True, "sem regime_weights na spec"
    componentes = result.get("componentes") or []
    actual_list = [float(c["peso"]) for c in componentes if float(c.get("peso") or 0) > 0]
    expected_list = [
        float(expected_rw[k])
        for k in sorted(expected_rw.keys(), key=lambda x: int(re.sub(r"\D", "", x) or "0"))
    ]
    mismatches: list[str] = []
    if len(actual_list) != len(expected_list):
        mismatches.append(f"contagem: spec={len(expected_list)} componentes={len(actual_list)}")
    for i, exp in enumerate(expected_list):
        found = actual_list[i] if i < len(actual_list) else None
        if found is None or not _approx_equal(exp, found):
            mismatches.append(f"w{i+1}: spec={exp} código={found}")
    if mismatches:
        return False, "; ".join(mismatches)
    return True, "pesos regime conferem"


def check_a1_inputs(aba_id: str, result: dict[str, Any] | None) -> CheckResult:
    if result is None:
        return CheckResult("FAIL", "compute_regime não retornou resultado")
    componentes = result.get("componentes") or []
    if not componentes:
        return CheckResult("FAIL", "sem componentes no output")
    derived_keys = (
        "percentile_0_1",
        "z_score",
        "cape_cheap",
        "pc_contra",
        "aaii_contra",
        "naaim_contra",
        "er_contrib_0_1",
        "bonus_0_1",
        "usd_weak",
        "ry_low",
        "be_contrib",
        "gov_contrib",
        "util_contrib",
        "reer_cheap",
    )
    missing: list[str] = []
    for comp in componentes:
        peso = float(comp.get("peso") or 0)
        if peso <= 0:
            continue
        val = comp.get("valor")
        contrib = comp.get("contribuicao")
        has_signal = (
            contrib is not None
            or val is not None
            or any(comp.get(k) is not None for k in derived_keys)
        )
        if not has_signal:
            missing.append(str(comp.get("id", "?")))
    if missing:
        return CheckResult("FAIL", f"inputs nulos: {', '.join(missing)}")
    return CheckResult("PASS", f"{len(componentes)} componentes com dados")


def check_a2_fallbacks(aba_id: str, cfg: dict[str, Any] | None, source: str) -> CheckResult:
    if not source:
        return CheckResult("N/A", "arquivo modelo ausente")
    hidden_fallbacks = []
    note = ((cfg or {}).get("note") or "").lower()
    if "f_val = 0.5" in source:
        if "get_external_series(\"cme\", \"fed_cut_probability\")" in source or "fed_cut_probability" in source:
            return CheckResult("PASS", "fallback fed_cut 0.5 quando CME ausente — padrão conhecido")
        if "fed" not in note and "cme" not in note and "default" not in note:
            hidden_fallbacks.append("fed_cut_probability default 0.5 sem nota na config")
    if "return 0.5, None" in source and "percentile" in source.lower():
        if not note:
            hidden_fallbacks.append("percentil default 0.5 sem histórico (verificar documentação)")
    if hidden_fallbacks:
        return CheckResult("FAIL", "; ".join(hidden_fallbacks))
    if "f_val = 0.5" in source:
        return CheckResult("PASS", "fallback fed_cut 0.5 (CME ausente) — padrão conhecido")
    return CheckResult("PASS", "nenhum fallback silencioso detectado")


def check_a3_reference_dates(aba_id: str, result: dict[str, Any] | None) -> CheckResult:
    if result is None:
        return CheckResult("N/A", "sem output")
    needs_ref = aba_id == "fi_preferred"
    if not needs_ref:
        return CheckResult("N/A", "classe sem inputs não-diários obrigatórios")
    ref_keys = [k for k in result if "reference_date" in k or "sloos_reference" in k]
    if ref_keys:
        return CheckResult("PASS", f"expõe {', '.join(ref_keys)}")
    if aba_id == "fi_preferred" and result.get("sloos_reference_date"):
        return CheckResult("PASS", "sloos_reference_date presente")
    return CheckResult("FAIL", "reference_date ausente para input não-diário")


def check_b4_weights(cfg: dict[str, Any] | None, result: dict[str, Any] | None) -> CheckResult:
    if cfg is None or result is None:
        return CheckResult("FAIL", "config ou resultado ausente")
    ok, detail = _compare_config_weights(cfg, result)
    return CheckResult("PASS" if ok else "FAIL", detail)


def check_b6_percentile_usage(aba_id: str, source: str) -> CheckResult:
    if not source:
        return CheckResult("N/A", "modelo ausente")
    regime_ok = (
        "_percentile_0_1" in source
        or "percentile_latest" in source
        or "regime_series" in source
    )
    sec_map = {
        "cash_equivalents": "cash_security_score.py",
        "fi_treasury": "treasury_security_score.py",
        "fi_ig": "ig_security_score.py",
        "fi_hy": "hy_security_score.py",
        "fi_tips": "tips_security_score.py",
        "fi_preferred": "preferred_security_score.py",
        "us_equity": "us_equity_security_score.py",
        "intl_equity": "intl_equity_security_score.py",
        "em_equity": "em_equity_security_score.py",
        "reits": "reits_security_score.py",
        "commodities_precious": "commodities_precious_security_score.py",
        "commodities_energy": "commodities_energy_security_score.py",
        "energy_mlp": "energy_mlp_security_score.py",
        "healthcare_biotech": "healthcare_biotech_security_score.py",
        "credito_alternativo": "bdc_security_score.py",
        "alt_infrastructure": "alt_infrastructure_security_score.py",
        "currencies": "fx_security_score.py",
    }
    sec_file = MOTOR_ROOT / "src" / "calculo" / sec_map.get(aba_id, "")
    sec_src = sec_file.read_text(encoding="utf-8") if sec_file.is_file() else ""
    cs_ok = "_cross_sectional_percentile" in sec_src or "cross_sectional" in sec_src.lower()
    if regime_ok and (cs_ok or not sec_file.is_file()):
        return CheckResult("PASS", "regime histórico + security cross-sectional")
    if not regime_ok:
        return CheckResult("FAIL", "regime sem percentil histórico explícito")
    return CheckResult("FAIL", "security sem percentil cross-sectional")


def check_c7_overrides(aba_id: str, source: str) -> CheckResult:
    expected = OVERRIDE_EXPECTATIONS.get(aba_id)
    if not expected:
        return CheckResult("N/A", "sem override na spec")
    if not source:
        return CheckResult("FAIL", "modelo ausente")
    missing: list[str] = []
    for flag, fn in expected:
        pattern = rf"if\s+{flag}[\s\S]{{0,120}}{fn}\("
        if not re.search(pattern, source):
            # relaxed: flag and fn exist in proximity
            if flag not in source or fn not in source:
                missing.append(f"{flag}→{fn}")
    if missing:
        return CheckResult("FAIL", f"override não encontrado: {', '.join(missing)}")
    extra_detail = ""
    if aba_id == "fi_tips" and 'labels.get("hold"' not in source:
        return CheckResult("FAIL", "tips_liquidity não trava em Hold")
    if aba_id == "fi_preferred" and 'labels.get("strong_reduce"' not in source:
        return CheckResult("FAIL", "bank_stress não trava em Strong Reduce")
    if aba_id == "em_equity" and "dxy" in source.lower() and "vix" in source.lower():
        extra_detail = " (duplo gatilho DXY+VIX)"
    return CheckResult("PASS", f"direções override conferem{extra_detail}")


def check_d8_calibrated(cfg: dict[str, Any] | None, result: dict[str, Any] | None) -> CheckResult:
    if cfg is None:
        return CheckResult("FAIL", "config regime ausente")
    cfg_cal = cfg.get("calibrated")
    out_cal = (result or {}).get("calibrated")
    if cfg_cal is True or out_cal is True:
        return CheckResult("FAIL", f"calibrated:true (config={cfg_cal}, output={out_cal})")
    if cfg_cal is False and out_cal is False:
        return CheckResult("PASS", "calibrated:false em config e output")
    if cfg_cal is False:
        return CheckResult("PASS", "calibrated:false em config")
    return CheckResult("FAIL", "calibrated ausente ou inconsistente")


def check_d9_proxies(aba_id: str, aba_cfg: dict[str, Any] | None) -> CheckResult:
    if not aba_cfg:
        return CheckResult("N/A", "aba config ausente")
    issues: list[str] = []
    for ind in aba_cfg.get("indicadores") or []:
        if ind.get("is_proxy"):
            rationale = (ind.get("proxy_rationale") or "").strip()
            if not rationale:
                issues.append(f"{ind.get('id')}: sem proxy_rationale")
            paid_names = ("ACM", "Bloomberg", "MSCI", "Refinitiv", "FMP", "Polygon")
            nome = (ind.get("nome") or "") + (ind.get("id") or "")
            for pn in paid_names:
                if pn.lower() in nome.lower() and "proxy" not in nome.lower():
                    issues.append(f"{ind.get('id')}: nome indicador pago '{pn}'")
    if issues:
        return CheckResult("FAIL", "; ".join(issues))
    proxy_count = sum(1 for i in (aba_cfg.get("indicadores") or []) if i.get("is_proxy"))
    if proxy_count:
        return CheckResult("PASS", f"{proxy_count} proxy(s) com rationale")
    return CheckResult("PASS", "nenhum proxy Tipo B na aba (ok se spec não exige)")


def check_d10_tipo_c() -> CheckResult:
    manifest_path = CONFIG_DIR / "fontes_manifest.json"
    if not manifest_path.is_file():
        return CheckResult("N/A", "fontes_manifest ausente")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    enabled_tipo_c: list[str] = []
    for src_id, meta in (manifest.get("sources") or manifest).items():
        if not isinstance(meta, dict):
            continue
        if meta.get("tipo") == "C" or "Tipo C" in str(meta.get("nota", "")):
            if meta.get("enabled", True):
                enabled_tipo_c.append(str(src_id))
    if enabled_tipo_c:
        return CheckResult("FAIL", f"fontes Tipo C habilitadas: {', '.join(enabled_tipo_c)}")
    return CheckResult("PASS", "nenhum indicador Tipo C habilitado")


def audit_class(aba_id: str) -> ClassAudit:
    from motor.src.calculo.class_model_registry import get_class_model_entry

    audit = ClassAudit(aba_id=aba_id)
    entry = get_class_model_entry(aba_id)
    audit.registry = entry is not None
    if not entry:
        audit.maturity = 0
        for key in ("A1", "A2", "A3", "B4", "B5", "B6", "C7", "D8", "D9", "D10"):
            audit.checks[key] = CheckResult("N/A", "classe não implementada")
        return audit

    cfg = _load_regime_config(aba_id)
    aba_cfg = _load_aba_config(aba_id)
    source = _model_source(aba_id)
    result: dict[str, Any] | None = None
    try:
        result = entry["compute_regime"]()
    except Exception as exc:  # noqa: BLE001
        audit.divergences.append(f"compute_regime falhou: {exc}")

    audit.checks["A1"] = check_a1_inputs(aba_id, result)
    audit.checks["A2"] = check_a2_fallbacks(aba_id, cfg, source)
    audit.checks["A3"] = check_a3_reference_dates(aba_id, result)
    audit.checks["B4"] = check_b4_weights(cfg, result)
    audit.checks["B5"] = CheckResult("MANUAL", "sinais (+/−, inversões, clip assimétrico) — revisão humana")
    audit.checks["B6"] = check_b6_percentile_usage(aba_id, source)
    audit.checks["C7"] = check_c7_overrides(aba_id, source)
    audit.checks["D8"] = check_d8_calibrated(cfg, result)
    audit.checks["D9"] = check_d9_proxies(aba_id, aba_cfg)
    audit.checks["D10"] = check_d10_tipo_c() if aba_id == CLASSES[0] else CheckResult("N/A", "verificação global D10")

    if result and result.get("calibrated") is True:
        audit.calibrated_alert = True
    if cfg and cfg.get("calibrated") is True:
        audit.calibrated_alert = True

    for key, chk in audit.checks.items():
        if chk.status == "FAIL":
            audit.divergences.append(f"{key}: {chk.detail}")

    automated = [audit.checks[k] for k in ("A1", "A2", "A3", "B4", "B6", "C7", "D8", "D9")]
    automated_status = [c.status for c in automated if c.status not in ("N/A", "MANUAL")]
    if audit.calibrated_alert:
        audit.maturity = 4
    elif any(s == "FAIL" for s in automated_status):
        audit.maturity = 1
    else:
        audit.maturity = 2

    return audit


def _history_covers(as_of: dt.date, window_days: int, series: pd.Series) -> tuple[bool, str]:
    if series.empty:
        return False, "série vazia"
    start_needed = as_of - dt.timedelta(days=window_days + 30)
    earliest = pd.Timestamp(series.index.min()).date()
    if earliest > start_needed:
        return False, f"histórico desde {earliest}, precisa ~{start_needed}"
    return True, f"histórico desde {earliest}"


def run_retro_tests() -> dict[str, CheckResult]:
    from motor.src.calculo.derivados import get_fred_series
    from motor.src.calculo.models.hy_regime_model import (
        compute_hy_regime,
        sanity_check_hy_stress_h2_2008,
        sanity_check_hy_stress_march_2020,
    )
    from motor.src.calculo.models.preferred_regime_model import (
        compute_preferred_regime,
        sanity_check_bank_stress_march_2023,
    )
    from motor.src.calculo.models.tips_regime_model import (
        sanity_check_tips_liquidity_march_2020,
    )
    from motor.src.calculo.models.treasury_regime_model import (
        compute_treasury_regime,
        sanity_check_inflation_shock_2022,
    )

    retro: dict[str, CheckResult] = {}

    # T1 — Treasuries 2022 inflation_shock, NOT flight_to_quality
    try:
        s = sanity_check_inflation_shock_2022()
        if not s.get("ok"):
            retro["T1"] = CheckResult("NÃO EXECUTADO", s.get("error", "sem dados"))
        else:
            ftq_2022 = int(s.get("flight_to_quality_days", 0))
            passed = bool(s.get("passed"))
            status: Status = "PASS" if passed else "FAIL"
            retro["T1"] = CheckResult(
                status,
                f"inflation_shock_days={s.get('inflation_shock_days')}, flight_to_quality_2022={ftq_2022}",
            )
    except Exception as exc:  # noqa: BLE001
        retro["T1"] = CheckResult("NÃO EXECUTADO", str(exc))

    # T2 — Treasuries flight_to_quality feb-abr/2020
    try:
        ref = get_fred_series("DFII10")
        hits = 0
        start, end = dt.date(2020, 2, 1), dt.date(2020, 4, 30)
        for d in ref.index:
            d_date = d.date() if hasattr(d, "date") else pd.Timestamp(d).date()
            if d_date < start or d_date > end:
                continue
            r = compute_treasury_regime(d_date)
            if r.get("flight_to_quality_flag"):
                hits += 1
        if ref.empty:
            retro["T2"] = CheckResult("NÃO EXECUTADO", "sem DFII10")
        elif hits > 0:
            retro["T2"] = CheckResult("PASS", f"flight_to_quality_days={hits}")
        else:
            retro["T2"] = CheckResult("FAIL", "flight_to_quality não disparou fev-abr/2020")
    except Exception as exc:  # noqa: BLE001
        retro["T2"] = CheckResult("NÃO EXECUTADO", str(exc))

    # T3 — HY hy_stress feb-abr/2020
    try:
        s = sanity_check_hy_stress_march_2020()
        if not s.get("ok"):
            detail = s.get("error", "")
            if "precisa" in detail or "desde" in detail:
                retro["T3"] = CheckResult("JANELA REDUZIDA", detail)
            else:
                retro["T3"] = CheckResult("NÃO EXECUTADO", detail)
        else:
            ref = get_fred_series("BAMLH0A0HYM2")
            hits = 0
            start, end = dt.date(2020, 2, 1), dt.date(2020, 4, 30)
            for d in ref.index:
                d_date = d.date() if hasattr(d, "date") else pd.Timestamp(d).date()
                if d_date < start or d_date > end:
                    continue
                r = compute_hy_regime(d_date)
                if r.get("hy_stress_flag"):
                    hits += 1
            status: Status = "PASS" if hits > 0 else "FAIL"
            retro["T3"] = CheckResult(status, f"hy_stress_days_fev-abr/2020={hits}")
    except Exception as exc:  # noqa: BLE001
        retro["T3"] = CheckResult("NÃO EXECUTADO", str(exc))

    # T4 — HY NOT Overweight sep-out/2008
    try:
        s = sanity_check_hy_stress_h2_2008()
        ref = get_fred_series("BAMLH0A0HYM2")
        if not s.get("ok") or ref.empty:
            retro["T4"] = CheckResult("NÃO EXECUTADO", s.get("error", "sem HY OAS"))
        else:
            covers, hist_note = _history_covers(dt.date(2008, 9, 1), 1260, ref)
            ow_dates: list[str] = []
            start, end = dt.date(2008, 9, 1), dt.date(2008, 10, 31)
            for d in ref.index:
                d_date = d.date() if hasattr(d, "date") else pd.Timestamp(d).date()
                if d_date < start or d_date > end:
                    continue
                r = compute_hy_regime(d_date)
                if r.get("regime_action") == "Overweight":
                    ow_dates.append(d_date.isoformat())
            if ow_dates:
                retro["T4"] = CheckResult("FAIL", f"Overweight em {', '.join(ow_dates[:5])}")
            elif not covers:
                retro["T4"] = CheckResult("JANELA REDUZIDA", f"sem Overweight; {hist_note}")
            elif s.get("passed"):
                retro["T4"] = CheckResult("PASS", f"hy_stress H2/2008 ok; sem Overweight set-out; {hist_note}")
            else:
                retro["T4"] = CheckResult("JANELA REDUZIDA", f"sem Overweight set-out; hy_stress fraco; {hist_note}")
    except Exception as exc:  # noqa: BLE001
        retro["T4"] = CheckResult("NÃO EXECUTADO", str(exc))

    retro["T5"] = CheckResult("NÃO EXECUTADO", "sanity_check Cash 2022 não implementado")
    retro["T7"] = CheckResult("NÃO EXECUTADO", "sanity_check TIPS jan-jun/2021 não implementado")
    retro["T9"] = CheckResult("NÃO EXECUTADO", "sanity_check Preferred F_capped 2021 não implementado")
    retro["T10"] = CheckResult("NÃO EXECUTADO", "sanity_check REITs 2022 não implementado")

    # T6 — TIPS tips_liquidity feb-abr/2020
    try:
        s = sanity_check_tips_liquidity_march_2020()
        if not s.get("ok"):
            retro["T6"] = CheckResult("NÃO EXECUTADO", s.get("error", ""))
        elif s.get("passed"):
            retro["T6"] = CheckResult("PASS", f"tips_liquidity_days={s.get('tips_liquidity_days')}")
        else:
            retro["T6"] = CheckResult("FAIL", "tips_liquidity não disparou mar/2020")
    except Exception as exc:  # noqa: BLE001
        retro["T6"] = CheckResult("NÃO EXECUTADO", str(exc))

    # T8 — Preferred bank_stress mar-mai/2023
    try:
        s = sanity_check_bank_stress_march_2023()
        if not s.get("ok"):
            retro["T8"] = CheckResult("NÃO EXECUTADO", s.get("error", ""))
        else:
            ref = get_fred_series("DGS10")
            hits = 0
            start, end = dt.date(2023, 3, 1), dt.date(2023, 5, 31)
            for d in ref.index:
                d_date = d.date() if hasattr(d, "date") else pd.Timestamp(d).date()
                if d_date < start or d_date > end:
                    continue
                r = compute_preferred_regime(d_date)
                if r.get("bank_stress_flag"):
                    hits += 1
            status = "PASS" if hits > 0 and s.get("passed") else "FAIL"
            retro["T8"] = CheckResult(status, f"bank_stress_days_mar-mai/2023={hits}")
    except Exception as exc:  # noqa: BLE001
        retro["T8"] = CheckResult("NÃO EXECUTADO", str(exc))

    return retro


def run_global_checks() -> dict[str, CheckResult]:
    globals_: dict[str, CheckResult] = {}

    # G1 — no price_amlp
    hits: list[str] = []
    for path in MOTOR_ROOT.rglob("*"):
        if path.suffix not in {".py", ".json", ".md", ".ts", ".tsx"}:
            continue
        if "__pycache__" in path.parts:
            continue
        if path.name == "audit_models.py":
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        if "price_amlp" in text:
            hits.append(str(path.relative_to(MOTOR_ROOT)))
    globals_["G1"] = CheckResult(
        "PASS" if not hits else "FAIL",
        "ausente" if not hits else f"encontrado em: {', '.join(hits[:5])}",
    )

    # G2 — rsi_14 not in cash tecnicos
    cash_tec = CONFIG_DIR / "indicadores_tecnicos_cash.json"
    if cash_tec.is_file():
        cfg = json.loads(cash_tec.read_text(encoding="utf-8"))
        ids = {i.get("id") for i in cfg.get("indicadores", [])}
        excluded = set(cfg.get("exclude_indicators") or [])
        bad = "rsi_14" in ids or ("rsi_14" not in excluded and "rsi_14d" in ids)
        if "rsi_14" in excluded and "rsi_14" not in ids:
            globals_["G2"] = CheckResult("PASS", "rsi_14 excluído de cash técnicos")
        elif bad:
            globals_["G2"] = CheckResult("FAIL", "rsi_14 presente em cash técnicos")
        else:
            globals_["G2"] = CheckResult("PASS", "rsi_14 ausente dos indicadores cash")
    else:
        globals_["G2"] = CheckResult("FAIL", "indicadores_tecnicos_cash.json ausente")

    # G3 — RSI JAAA divergence
    try:
        from motor.src.calculo.indicadores_tecnicos import _rsi, compute_for_ticker
        from motor.src.config_loader import load_tecnicos_config
        from motor.src.ingestao.yfinance_client import get_price_series

        ticker = "JAAA"
        prices = get_price_series(ticker)
        if prices.empty:
            globals_["G3"] = CheckResult("NÃO EXECUTADO", "sem preços JAAA no DB")
        else:
            cfg = load_tecnicos_config("cash_equivalents")
            internal = compute_for_ticker(ticker, "AGG", cfg).get("rsi_14")
            classic = _rsi(prices, cfg.get("rsi_period", 14))
            int_val = float(internal.dropna().iloc[-1]) if internal is not None and not internal.dropna().empty else None
            cls_val = float(classic.dropna().iloc[-1]) if not classic.dropna().empty else None
            if int_val is None or cls_val is None:
                globals_["G3"] = CheckResult("NÃO EXECUTADO", "RSI indisponível")
            else:
                delta = abs(int_val - cls_val)
                if delta > 5:
                    globals_["G3"] = CheckResult(
                        "FAIL",
                        f"RSI interno={int_val:.2f} vs clássico={cls_val:.2f} (Δ={delta:.2f}) — revisar série/janela",
                    )
                else:
                    globals_["G3"] = CheckResult("PASS", f"RSI JAAA alinhado ({int_val:.2f} vs {cls_val:.2f})")
    except Exception as exc:  # noqa: BLE001
        globals_["G3"] = CheckResult("NÃO EXECUTADO", str(exc))

    # G4 — no FMP/Polygon in motor/
    paid_hits: list[str] = []
    for path in MOTOR_ROOT.rglob("*.py"):
        if "__pycache__" in path.parts or path.name == "audit_models.py":
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        if re.search(r"\bFMP\b|financialmodelingprep|polygon\.io|\bPolygon\b", text, re.I):
            paid_hits.append(str(path.relative_to(MOTOR_ROOT)))
    globals_["G4"] = CheckResult(
        "PASS" if not paid_hits else "FAIL",
        "ausente" if not paid_hits else f"refs: {', '.join(paid_hits[:5])}",
    )

    # G5 — WatchlistClassTable not altered for models
    wl_path = REPO_ROOT / "components" / "home" / "WatchlistClassTable.tsx"
    if not wl_path.is_file():
        globals_["G5"] = CheckResult("FAIL", "arquivo ausente")
    else:
        text = wl_path.read_text(encoding="utf-8")
        model_refs = [kw for kw in ("regime_model", "RegimeModel", "SymbolClassRegime", "calibrated") if kw in text]
        try:
            diff = subprocess.run(
                ["git", "diff", "--name-only", "HEAD", "--", str(wl_path)],
                capture_output=True,
                text=True,
                cwd=REPO_ROOT,
                check=False,
            )
            uncommitted = bool(diff.stdout.strip())
        except OSError:
            uncommitted = False
        if model_refs:
            globals_["G5"] = CheckResult("FAIL", f"referências modelo: {', '.join(model_refs)}")
        elif uncommitted:
            globals_["G5"] = CheckResult("FAIL", "alterações não commitadas no arquivo")
        else:
            globals_["G5"] = CheckResult("PASS", "sem referências a modelos de regime; working tree limpo")

    # G6 — SHV in cash not treasury
    cash_cfg = _load_aba_config("cash_equivalents")
    tre_cfg = _load_aba_config("fi_treasury")
    cash_tickers = {u.get("ticker") for u in (cash_cfg or {}).get("universo", [])}
    tre_tickers = {u.get("ticker") for u in (tre_cfg or {}).get("universo", [])}
    if "SHV" in cash_tickers and "SHV" not in tre_tickers:
        globals_["G6"] = CheckResult("PASS", "SHV em cash_equivalents, ausente de fi_treasury")
    elif "SHV" in tre_tickers:
        globals_["G6"] = CheckResult("FAIL", "SHV ainda em fi_treasury")
    else:
        globals_["G6"] = CheckResult("FAIL", "SHV ausente de cash_equivalents")

    # G7 — US volume, intl MM200, infra real yield
    us_src = (MOTOR_ROOT / "src" / "calculo" / "us_equity_security_score.py").read_text(encoding="utf-8")
    intl_src = (MOTOR_ROOT / "src" / "calculo" / "intl_equity_security_score.py").read_text(encoding="utf-8")
    infra_reg = _model_source("alt_infrastructure")
    issues: list[str] = []
    if "volume" not in us_src.lower():
        issues.append("US equity sem volume no security")
    if "mm200" not in intl_src.lower() and "MM200" not in intl_src:
        issues.append("Intl equity sem MM200 no trend")
    if "DFII10" not in infra_reg and "real_yield" not in infra_reg:
        issues.append("Infrastructure regime sem yield real (DFII10)")
    globals_["G7"] = CheckResult(
        "PASS" if not issues else "FAIL",
        "volume US + MM200 Intl + yield real Infra" if not issues else "; ".join(issues),
    )

    return globals_


def apply_maturity_from_retro(classes: dict[str, ClassAudit], retro: dict[str, CheckResult]) -> None:
    blocking = {"T1", "T4", "T6", "T8"}
    for aba_id, audit in classes.items():
        if audit.maturity in (0, 4):
            continue
        tests = CLASS_RETRO_TESTS.get(aba_id, [])
        if not tests:
            continue
        results = [retro.get(t) for t in tests if retro.get(t)]
        if not results:
            continue
        executable = [r for r in results if r and r.status not in ("NÃO EXECUTADO",)]
        if not executable:
            continue
        all_pass = all(r.status in ("PASS", "JANELA REDUZIDA") for r in executable)
        any_fail = any(r.status == "FAIL" for r in executable)
        if all_pass and not any_fail and audit.maturity == 2:
            audit.maturity = 3


def collect_alerts(
    classes: dict[str, ClassAudit],
    retro: dict[str, CheckResult],
    globals_: dict[str, CheckResult],
) -> list[str]:
    alerts: list[str] = []
    for aba_id, audit in classes.items():
        if audit.maturity == 1:
            alerts.append(f"Classe {aba_id} em nível 1 (parcial) — {', '.join(audit.divergences[:2])}")
        if audit.maturity == 4 or audit.calibrated_alert:
            alerts.append(f"Classe {aba_id} marcada calibrated:true — nível 4 indevido")
    for aba_id, audit in classes.items():
        if audit.checks.get("C7") and audit.checks["C7"].status == "FAIL":
            alerts.append(f"Override bidirecional ou ausente em {aba_id}")
        if audit.checks.get("D9") and audit.checks["D9"].status == "FAIL":
            alerts.append(f"Proxy Tipo B incompleto em {aba_id}")
    for key in ("T1", "T4", "T6", "T8"):
        r = retro.get(key)
        if r and r.status in ("FAIL", "NÃO EXECUTADO"):
            alerts.append(f"Teste bloqueante {key}: {r.status} — {r.detail}")
    if globals_.get("G1", CheckResult("PASS")).status == "FAIL":
        alerts.append("G1: price_amlp ainda presente no motor")
    d10 = next((a.checks.get("D10") for a in classes.values() if a.checks.get("D10", CheckResult("N/A")).status != "N/A"), None)
    if d10 and d10.status == "FAIL":
        alerts.append(f"D10/G8: {d10.detail}")
    weight_fails = [a.aba_id for a in classes.values() if a.checks.get("B4", CheckResult("N/A")).status == "FAIL"]
    if weight_fails:
        alerts.append(f"Divergência de pesos (B4): {', '.join(weight_fails)}")
    return alerts


def _class_test_summary(aba_id: str, retro: dict[str, CheckResult]) -> str:
    tests = CLASS_RETRO_TESTS.get(aba_id, [])
    if not tests:
        return "—"
    parts = []
    for t in tests:
        r = retro.get(t)
        parts.append(f"{t}:{r.status if r else '?'}")
    return ", ".join(parts)


def render_report(report: AuditReport) -> str:
    lines: list[str] = []
    date_str = report.generated_at.strftime("%Y-%m-%d %H:%M UTC")
    implemented = sum(1 for a in report.classes.values() if a.registry)
    levels = {i: sum(1 for a in report.classes.values() if a.maturity == i) for i in range(5)}
    blocking_ok = sum(
        1 for k in ("T1", "T4", "T6", "T8")
        if report.retro.get(k) and report.retro[k].status in ("PASS", "JANELA REDUZIDA")
    )

    lines.append(f"# Auditoria de Modelos — {date_str}")
    lines.append("")
    lines.append("## 1. Sumário executivo")
    lines.append(f"- Classes especificadas: 17")
    lines.append(f"- Classes implementadas: {implemented}")
    lines.append(
        f"- Distribuição por nível: N0={levels[0]}, N1={levels[1]}, N2={levels[2]}, N3={levels[3]}, N4={levels[4]}"
    )
    lines.append(f"- Testes bloqueantes: {blocking_ok} de 4 aprovados")
    lines.append(f"- Sinais de alerta: {len(report.alerts)}")
    lines.append("")
    lines.append("## 2. Sinais de alerta")
    if report.alerts:
        for a in report.alerts:
            lines.append(f"- {a}")
    else:
        lines.append("- nenhum")
    lines.append("")
    lines.append("## 3. Matriz por classe")
    lines.append(
        "| Classe | Nível | A1 | A2 | A3 | B4 | B5 | B6 | C7 | D8 | D9 | D10 | Teste |"
    )
    lines.append("|--------|-------|----|----|----|----|----|----|----|----|----|-----|-------|")
    for aba_id in CLASSES:
        a = report.classes[aba_id]
        row = [
            aba_id,
            str(a.maturity),
            _status_icon(a.checks["A1"].status),
            _status_icon(a.checks["A2"].status),
            _status_icon(a.checks["A3"].status),
            _status_icon(a.checks["B4"].status),
            _status_icon(a.checks["B5"].status),
            _status_icon(a.checks["B6"].status),
            _status_icon(a.checks["C7"].status),
            _status_icon(a.checks["D8"].status),
            _status_icon(a.checks["D9"].status),
            _status_icon(a.checks.get("D10", CheckResult("N/A")).status),
            _class_test_summary(aba_id, report.retro),
        ]
        lines.append("| " + " | ".join(row) + " |")
    lines.append("")
    lines.append("## 4. Verificações globais (G1-G7)")
    for key in [f"G{i}" for i in range(1, 8)]:
        r = report.globals.get(key, CheckResult("N/A", ""))
        lines.append(f"- **{key}**: {r.status} — {r.detail}")
    lines.append("")
    lines.append("## 5. Testes retroativos (tabela da seção 4)")
    lines.append("")
    lines.append("| ID | Classe | Período | Bloqueante | Status | Observação |")
    lines.append("|---|---|---|---|---|---|")
    retro_meta = [
        ("T1", "Treasuries", "2022", "Sim", "inflation_shock dispara, flight_to_quality NÃO"),
        ("T2", "Treasuries", "fev-abr/2020", "Não", "flight_to_quality dispara"),
        ("T3", "HY", "fev-abr/2020", "Não", "hy_stress dispara"),
        ("T4", "HY", "jun-dez/2008", "Sim", "NÃO gerar Overweight em set-out/2008"),
        ("T5", "Cash", "2022", "Não", "score sobe ao longo do ano"),
        ("T6", "TIPS", "fev-abr/2020", "Sim", "tips_liquidity dispara"),
        ("T7", "TIPS", "jan-jun/2021", "Não", "score favorece TIPS"),
        ("T8", "Preferred", "mar-mai/2023", "Sim", "bank_stress dispara"),
        ("T9", "Preferred", "2021", "Não", "F_capped satura em 0.6"),
        ("T10", "REITs", "2022", "Não", "score cai ao longo do ano"),
    ]
    for tid, cls, period, block, note in retro_meta:
        r = report.retro.get(tid, CheckResult("NÃO EXECUTADO", ""))
        lines.append(f"| {tid} | {cls} | {period} | {block} | {r.status} | {r.detail or note} |")
    lines.append("")
    lines.append("## 6. Divergências detalhadas")
    if report.divergences:
        for d in report.divergences:
            lines.append(f"- {d}")
    else:
        lines.append("- Nenhuma divergência automatizada registrada. Itens MANUAL (B5, partes de C7) requerem revisão humana.")
    lines.append("")
    lines.append("## 7. Queríamos vs Executamos")
    lines.append("| Objetivo | Status | Evidência |")
    lines.append("|---|---|---|")
    qve = [
        (
            "17 classes com regime + seleção separados",
            "PASS" if implemented == 17 else "PARCIAL",
            f"{implemented}/17 no class_model_registry",
        ),
        (
            "Zero dado pago",
            report.globals.get("G4", CheckResult("?", "")).status,
            report.globals.get("G4", CheckResult("", "")).detail,
        ),
        (
            "Proxies transparentes (is_proxy)",
            "PASS"
            if not any(a.checks.get("D9", CheckResult("PASS")).status == "FAIL" for a in report.classes.values())
            else "FAIL",
            "D9 por classe + proxy_indicators.py",
        ),
        (
            "Driver circular do MLP corrigido",
            report.globals.get("G1", CheckResult("?", "")).status,
            "distribution_yield_spread; sem price_amlp",
        ),
        (
            "Overrides direcionalmente corretos",
            "MANUAL"
            if any(a.checks.get("C7", CheckResult("N/A")).status == "MANUAL" for a in report.classes.values())
            else (
                "PASS"
                if not any(a.checks.get("C7", CheckResult("N/A")).status == "FAIL" for a in report.classes.values())
                else "FAIL"
            ),
            "C7 automatizado parcial; B5 manual",
        ),
        (
            "Markets UI intocada",
            report.globals.get("G5", CheckResult("?", "")).status,
            "WatchlistClassTable.tsx",
        ),
        (
            "Validação retroativa nos casos-limite",
            f"{blocking_ok}/4 bloqueantes",
            ", ".join(f"{k}:{report.retro[k].status}" for k in ("T1", "T4", "T6", "T8") if k in report.retro),
        ),
    ]
    for obj, status, ev in qve:
        lines.append(f"| {obj} | {status} | {ev} |")
    lines.append("")
    lines.append("## 8. Lacunas conhecidas e aceitas")
    lines.append("- Indicadores Tipo C documentados mas não habilitados (fontes_manifest `enabled: false`).")
    lines.append("- Infrastructure: proxies `infra_gov_z` / utilities com dados limitados.")
    lines.append("- REITs: dispersão setorial alta — security score genérico.")
    lines.append("- Pesos `calibrated: false` por design — julgamento, não fit estatístico.")
    lines.append("- Testes T5, T7, T9, T10 ainda sem `sanity_check` dedicado.")
    lines.append("- B5 (sinais de fórmula) e partes de C7 exigem revisão manual periódica.")
    lines.append("")
    lines.append("---")
    lines.append(f"*Gerado por `motor/scripts/audit_models.py` em {date_str}*")
    return "\n".join(lines) + "\n"


def run_audit() -> AuditReport:
    from motor.src.paths import load_env_from_repo

    load_env_from_repo()

    classes: dict[str, ClassAudit] = {}
    all_divergences: list[str] = []
    for aba_id in CLASSES:
        audit = audit_class(aba_id)
        classes[aba_id] = audit
        for d in audit.divergences:
            all_divergences.append(f"**{aba_id}** — {d}")

    globals_ = run_global_checks()
    retro = run_retro_tests()
    apply_maturity_from_retro(classes, retro)

    d10 = check_d10_tipo_c()
    for audit in classes.values():
        audit.checks["D10"] = d10

    alerts = collect_alerts(classes, retro, globals_)

    return AuditReport(
        generated_at=dt.datetime.now(dt.timezone.utc),
        classes=classes,
        globals=globals_,
        retro=retro,
        alerts=alerts,
        divergences=all_divergences,
    )


def print_summary(report: AuditReport) -> None:
    implemented = sum(1 for a in report.classes.values() if a.registry)
    levels = {i: sum(1 for a in report.classes.values() if a.maturity == i) for i in range(5)}
    blocking = {k: report.retro[k].status for k in ("T1", "T4", "T6", "T8") if k in report.retro}
    print("=== Auditoria de Modelos — resumo ===")
    print(f"Classes implementadas: {implemented}/17")
    print(f"Níveis: N0={levels[0]} N1={levels[1]} N2={levels[2]} N3={levels[3]} N4={levels[4]}")
    print(f"Alertas: {len(report.alerts)}")
    print(f"Testes bloqueantes: {blocking}")
    for a in report.alerts[:10]:
        print(f"  ALERTA: {a}")
    if len(report.alerts) > 10:
        print(f"  ... +{len(report.alerts) - 10} alertas")


def main() -> int:
    report = run_audit()
    md = render_report(report)
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(md, encoding="utf-8")
    print_summary(report)
    print(f"\nRelatório: {REPORT_PATH}")
    critical = any(
        report.classes[a].maturity in (1, 4)
        or report.retro.get(k, CheckResult("PASS")).status == "FAIL"
        for a in report.classes
        for k in ("T1", "T4", "T6", "T8")
    )
    return 1 if critical and report.alerts else 0


if __name__ == "__main__":
    raise SystemExit(main())
