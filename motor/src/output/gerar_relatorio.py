"""Generate markdown report for an aba."""

from __future__ import annotations

import datetime as dt
from pathlib import Path
from typing import Any

from motor.src.config_loader import (
    is_cash_aba,
    is_class_model_aba,
    is_em_equity_aba,
    is_hy_aba,
    is_ig_aba,
    is_intl_equity_aba,
    is_preferred_aba,
    is_tips_aba,
    is_treasury_aba,
    is_us_equity_aba,
    load_aba_config,
)
from motor.src.decisao.estagio import compute_estagio_aba, diverge_categoria, estagio_ativo
from motor.src.db.connection import get_connection
from motor.src.paths import OUTPUT_DIR


def _fmt(v: float | None, digits: int = 4) -> str:
    if v is None:
        return "—"
    return f"{v:.{digits}f}"


def build_report_markdown(
    aba_result: dict[str, Any],
    estagio_info: dict[str, Any],
    ativos: list[dict[str, Any]],
    categoria_estagio: str,
) -> str:
    lines: list[str] = []
    nome = aba_result.get("nome", aba_result["aba_id"])
    data = aba_result.get("data", dt.date.today().isoformat())
    s = aba_result["score_composto"]
    slope = estagio_info.get("slope", 0.0)
    estagio = estagio_info.get("estagio", "Maduro")
    dom = aba_result.get("indicador_dominante")

    lines.append(f"# Relatório — {nome} — {data}")
    lines.append("")
    lines.append("## Resumo")
    lines.append(f"- Score composto **S**: {_fmt(s)}")
    lines.append(f"- Estágio: **{estagio}** (slope={_fmt(slope)})")
    if dom:
        lines.append(
            f"- Indicador dominante: **{dom['nome']}** (contribuição={_fmt(dom['contribuicao'])})"
        )
    lines.append("")
    proxies = [c for c in aba_result.get("componentes", []) if c.get("is_proxy")]
    if proxies:
        lines.append("## Proxies (Tipo B)")
        lines.append("")
        for p in proxies:
            rationale = p.get("proxy_rationale", "")
            lines.append(f"- **{p['nome']}**: {rationale}")
        lines.append("")
    if is_cash_aba(aba_result["aba_id"]):
        lines.append("## Modelo Cash — Regime (Modelo 1)")
        lines.append("")
        try:
            from motor.src.calculo.models.cash_regime_model import compute_cash_regime

            regime = compute_cash_regime()
            lines.append(
                f"- CashRegimeScore: **{_fmt(regime.get('cash_regime_score'))}** "
                f"→ ação **{regime.get('regime_action')}** (quanto alocar)"
            )
            if regime.get("stress_flag"):
                lines.append(
                    f"- Stress override (ação calculada: {regime.get('regime_action_calculated')})"
                )
            for note in regime.get("explanation", []):
                lines.append(f"- {note.replace('**', '')}")
            if not regime.get("calibrated"):
                lines.append("- ⚠ Pesos não calibrados (`calibrated: false`).")
        except Exception as e:
            lines.append(f"- Erro regime cash: {e}")
        lines.append("")
        lines.append("## Modelo Cash — Seleção (Modelo 2)")
        lines.append("")
        lines.append(
            "- SecurityScore: 50% volume bruto + 35% σ20 invertida + 15% |ΔMA50| z-score invertido. "
            "RSI excluído — NAV monotônico distorce momentum em ETFs cash/CLO."
        )
        lines.append("")
    if is_treasury_aba(aba_result["aba_id"]):
        lines.append("## Modelo Treasuries — Regime (Modelo 1)")
        lines.append("")
        try:
            from motor.src.calculo.models.treasury_regime_model import (
                compute_treasury_regime,
                sanity_check_inflation_shock_2022,
            )

            regime = compute_treasury_regime()
            lines.append(
                f"- TreasuryRegimeScore: **{_fmt(regime.get('treasury_regime_score'))}** "
                f"→ ação **{regime.get('regime_action')}** (quanto duration)"
            )
            if regime.get("flight_to_quality_flag"):
                lines.append("- Flight-to-quality override (piso Overweight).")
            if regime.get("inflation_shock_flag"):
                lines.append("- Inflation-shock cap (teto Reduce — padrão 2022).")
            for note in regime.get("explanation", []):
                lines.append(f"- {note.replace('**', '')}")
            sanity = sanity_check_inflation_shock_2022()
            if sanity.get("ok"):
                lines.append(
                    f"- Sanity 2022: inflation_shock em {sanity.get('inflation_shock_days')} dias "
                    f"(passed={sanity.get('passed')})."
                )
            if not regime.get("calibrated"):
                lines.append("- ⚠ Pesos não calibrados (`calibrated: false`).")
        except Exception as e:
            lines.append(f"- Erro regime treasury: {e}")
        lines.append("")
        lines.append("## Modelo Treasuries — Seleção (Modelo 2)")
        lines.append("")
        lines.append(
            "- SecurityScore v2: 35% tendência/duration + 25% RSI(retorno/duration) + 20% volume bruto + 20% COT invertido (hold-last). "
            "RSI mantido — reversão de taxa genuína; duration evita viés da ponta longa."
        )
        lines.append("")
    if is_ig_aba(aba_result["aba_id"]):
        lines.append("## Modelo IG — Regime (Modelo 1)")
        lines.append("")
        try:
            from motor.src.calculo.models.ig_regime_model import (
                compute_ig_regime,
                sanity_check_credit_event_march_2020,
            )

            regime = compute_ig_regime()
            lines.append(
                f"- IGRegimeScore: **{_fmt(regime.get('ig_regime_score'))}** "
                f"→ ação **{regime.get('regime_action')}** (quanto IG)"
            )
            if regime.get("credit_event_flag"):
                lines.append(
                    f"- Credit event override (ação calculada: "
                    f"{regime.get('regime_action_calculated')})."
                )
            for note in regime.get("explanation", []):
                lines.append(f"- {note.replace('**', '')}")
            sanity = sanity_check_credit_event_march_2020()
            if sanity.get("ok"):
                lines.append(
                    f"- Sanity Mar/2020: credit_event em {sanity.get('credit_event_days')} dias "
                    f"(passed={sanity.get('passed')})."
                )
            if not regime.get("calibrated"):
                lines.append("- ⚠ Pesos não calibrados (`calibrated: false`).")
        except Exception as e:
            lines.append(f"- Erro regime IG: {e}")
        lines.append("")
        lines.append("## Modelo IG — Seleção (Modelo 2)")
        lines.append("")
        lines.append(
            "- SecurityScore v2: 30% tendência/duration + 20% RSI(retorno/duration) + 15% volume bruto + 35% duration fit (bucket vs term premium). "
            "OAS de crédito fica no Regime Score — FRED não tem spread por ETF."
        )
        lines.append("")
    if is_hy_aba(aba_result["aba_id"]):
        lines.append("## Modelo HY — Regime (Modelo 1)")
        lines.append("")
        try:
            from motor.src.calculo.models.hy_regime_model import (
                compute_hy_regime,
                sanity_check_hy_stress_h2_2008,
                sanity_check_hy_stress_march_2020,
            )

            regime = compute_hy_regime()
            lines.append(
                f"- HYRegimeScore: **{_fmt(regime.get('hy_regime_score'))}** "
                f"→ ação **{regime.get('regime_action')}** (quanto HY)"
            )
            if regime.get("hy_stress_flag"):
                lines.append(
                    f"- HY stress override (ação calculada: "
                    f"{regime.get('regime_action_calculated')})."
                )
            for note in regime.get("explanation", []):
                lines.append(f"- {note.replace('**', '')}")
            sanity_2020 = sanity_check_hy_stress_march_2020()
            if sanity_2020.get("ok"):
                lines.append(
                    f"- Sanity Mar/2020: hy_stress em {sanity_2020.get('hy_stress_days')} dias "
                    f"(passed={sanity_2020.get('passed')})."
                )
            sanity_2008 = sanity_check_hy_stress_h2_2008()
            if sanity_2008.get("ok"):
                lines.append(
                    f"- Sanity H2/2008: hy_stress em {sanity_2008.get('hy_stress_days')} dias "
                    f"(passed={sanity_2008.get('passed')})."
                )
            if not regime.get("calibrated"):
                lines.append("- ⚠ Pesos não calibrados (`calibrated: false`).")
        except Exception as e:
            lines.append(f"- Erro regime HY: {e}")
        lines.append("")
        lines.append("## Modelo HY — Seleção (Modelo 2)")
        lines.append("")
        lines.append(
            "- SecurityScore v2: 35% tendência + 25% RSI + 15% volume bruto + 25% σ20 invertida (lookback 20d). "
            "OAS de crédito fica no Regime Score — o sleeve pontuado é HY amplo (FRED BB/B/CCC não ranqueia)."
        )
        lines.append("")
    if is_tips_aba(aba_result["aba_id"]):
        lines.append("## Modelo TIPS — Regime (Modelo 1)")
        lines.append("")
        try:
            from motor.src.calculo.models.tips_regime_model import (
                compute_tips_regime,
                sanity_check_tips_liquidity_march_2020,
            )

            regime = compute_tips_regime()
            lines.append(
                f"- TIPSRegimeScore: **{_fmt(regime.get('tips_regime_score'))}** "
                f"→ ação **{regime.get('regime_action')}** (quanto TIPS)"
            )
            if regime.get("tips_liquidity_flag"):
                lines.append(
                    f"- Tips liquidity override (ação calculada: "
                    f"{regime.get('regime_action_calculated')})."
                )
            for note in regime.get("explanation", []):
                lines.append(f"- {note.replace('**', '')}")
            sanity = sanity_check_tips_liquidity_march_2020()
            if sanity.get("ok"):
                lines.append(
                    f"- Sanity Mar/2020: tips_liquidity em {sanity.get('tips_liquidity_days')} dias "
                    f"(passed={sanity.get('passed')})."
                )
            if not regime.get("calibrated"):
                lines.append("- ⚠ Pesos não calibrados (`calibrated: false`).")
        except Exception as e:
            lines.append(f"- Erro regime TIPS: {e}")
        lines.append("")
        lines.append("## Modelo TIPS — Seleção (Modelo 2)")
        lines.append("")
        lines.append(
            "- SecurityScore v2: 30% tendência/duration + 20% RSI(retorno/duration) + 15% volume bruto + 35% real-yield fit (bucket vs DFII10). "
            "Preço = close do ETF (yfinance), não dirty price de TIPS individual."
        )
        lines.append("")
    if is_preferred_aba(aba_result["aba_id"]):
        lines.append("## Modelo Preferred — Regime (Modelo 1)")
        lines.append("")
        try:
            from motor.src.calculo.models.preferred_regime_model import (
                compute_preferred_regime,
                sanity_check_bank_stress_march_2023,
            )

            regime = compute_preferred_regime()
            lines.append(
                f"- PreferredRegimeScore: **{_fmt(regime.get('preferred_regime_score'))}** "
                f"→ ação **{regime.get('regime_action')}** (quanto preferred)"
            )
            if regime.get("bank_stress_flag"):
                lines.append(
                    f"- Bank stress override (ação calculada: "
                    f"{regime.get('regime_action_calculated')})."
                )
            if regime.get("sloos_reference_date"):
                lines.append(
                    f"- SLOOS ref trimestral: {regime.get('sloos_reference_date')}."
                )
            for note in regime.get("explanation", []):
                lines.append(f"- {note.replace('**', '')}")
            sanity = sanity_check_bank_stress_march_2023()
            if sanity.get("ok"):
                lines.append(
                    f"- Sanity Mar/2023: bank_stress em {sanity.get('bank_stress_days')} dias "
                    f"(passed={sanity.get('passed')})."
                )
            if not regime.get("calibrated"):
                lines.append("- ⚠ Pesos não calibrados (`calibrated: false`).")
        except Exception as e:
            lines.append(f"- Erro regime Preferred: {e}")
        lines.append("")
        lines.append("## Modelo Preferred — Seleção (Modelo 2)")
        lines.append("")
        lines.append(
            "- SecurityScore v2: 30% tendência + 20% RSI + 25% yield anti-trap (haircut se z_252>0) + 25% σ20 invertida. "
            "Sem volume. Rating por emissor não entra — sleeve é ETF; crédito fica no Regime Score."
        )
        lines.append("")
    if is_us_equity_aba(aba_result["aba_id"]):
        lines.append("## Modelo US Equity — Regime (Modelo 1)")
        lines.append("")
        try:
            from motor.src.calculo.models.us_equity_regime_model import compute_us_equity_regime

            regime = compute_us_equity_regime()
            lines.append(
                f"- USEquityRegimeScore: **{_fmt(regime.get('us_equity_regime_score'))}** "
                f"→ ação **{regime.get('regime_action')}** (quanto US equity)"
            )
            if regime.get("recession_warning_flag") or regime.get("stress_flag"):
                lines.append(
                    f"- Recession warning (ação calculada: "
                    f"{regime.get('regime_action_calculated')})."
                )
            for note in regime.get("explanation", []):
                lines.append(f"- {note.replace('**', '')}")
            if not regime.get("calibrated"):
                lines.append("- ⚠ Pesos não calibrados (`calibrated: false`).")
        except Exception as e:
            lines.append(f"- Erro regime US Equity: {e}")
        lines.append("")
        lines.append("## Modelo US Equity — Seleção (Modelo 2)")
        lines.append("")
        lines.append(
            "- SecurityScore v2: 35% tendência + 25% RSI + 20% volume em dólar + 20% σ20 invertida (lookback 20d). "
            "Sem P/E/ROE nesta etapa. Percentil no universo da aba (sem neutralização setorial/cap)."
        )
        lines.append("")
    if is_intl_equity_aba(aba_result["aba_id"]):
        lines.append("## Modelo International Equity — Regime (Modelo 1)")
        lines.append("")
        try:
            from motor.src.calculo.models.intl_equity_regime_model import compute_intl_equity_regime

            regime = compute_intl_equity_regime()
            lines.append(
                f"- IntlEquityRegimeScore: **{_fmt(regime.get('intl_equity_regime_score'))}** "
                f"→ ação **{regime.get('regime_action')}** (quanto intl equity)"
            )
            for note in regime.get("explanation", []):
                lines.append(f"- {note.replace('**', '')}")
            if not regime.get("calibrated"):
                lines.append("- ⚠ Pesos não calibrados (`calibrated: false`).")
        except Exception as e:
            lines.append(f"- Erro regime International Equity: {e}")
        lines.append("")
        lines.append("## Modelo International Equity — Seleção (Modelo 2)")
        lines.append("")
        lines.append(
            "- SecurityScore v2: 30% tendência + 20% RSI + 20% σ20 invertida + 30% hedge fit vs UUP "
            "(distância ao alvo de |β|, bucket regional/cambial). Close USD do ETF — sem série em moeda local."
        )
        lines.append("")
    if is_em_equity_aba(aba_result["aba_id"]):
        lines.append("## Modelo Emerging Markets — Regime (Modelo 1)")
        lines.append("")
        try:
            from motor.src.calculo.models.em_equity_regime_model import compute_em_equity_regime

            regime = compute_em_equity_regime()
            lines.append(
                f"- EMEquityRegimeScore: **{_fmt(regime.get('em_equity_regime_score'))}** "
                f"→ ação **{regime.get('regime_action')}** (quanto EM equity)"
            )
            if regime.get("em_stress_flag") or regime.get("stress_flag"):
                lines.append(
                    f"- EM stress (DXY+VIX) — ação calculada: "
                    f"{regime.get('regime_action_calculated')}."
                )
            for note in regime.get("explanation", []):
                lines.append(f"- {note.replace('**', '')}")
            if not regime.get("calibrated"):
                lines.append("- ⚠ Pesos não calibrados (`calibrated: false`).")
        except Exception as e:
            lines.append(f"- Erro regime Emerging Markets: {e}")
        lines.append("")
        lines.append("## Modelo Emerging Markets — Seleção (Modelo 2)")
        lines.append("")
        lines.append(
            "- SecurityScore v2: 30% tendência + 20% RSI + 20% volume em dólar + 30% China fit vs FXI "
            "(distância ao alvo de β, bucket estrutural). Sem σ20 neste sleeve. FX fica no Regime Score."
        )
        lines.append("")
    _LEGACY_CLASS_REPORTS = {
        is_cash_aba,
        is_treasury_aba,
        is_ig_aba,
        is_hy_aba,
        is_tips_aba,
        is_preferred_aba,
        is_us_equity_aba,
        is_intl_equity_aba,
        is_em_equity_aba,
    }
    if is_class_model_aba(aba_result["aba_id"]) and not any(
        fn(aba_result["aba_id"]) for fn in _LEGACY_CLASS_REPORTS
    ):
        try:
            from motor.src.calculo.class_model_registry import get_class_model_entry

            entry = get_class_model_entry(aba_result["aba_id"])
            if entry:
                regime = entry["compute_regime"]()
                score_key = entry["score_key"]
                action_label = (
                    "ritmo de conversão"
                    if regime.get("output_type") == "pace"
                    else "quanto alocar"
                )
                lines.append(f"## Modelo {aba_result.get('nome', aba_result['aba_id'])} — Regime (Modelo 1)")
                lines.append("")
                lines.append(
                    f"- {score_key}: **{_fmt(regime.get(score_key))}** "
                    f"→ ação **{regime.get('regime_action')}** ({action_label})"
                )
                if regime.get("stress_flag"):
                    lines.append(
                        f"- Stress override (ação calculada: {regime.get('regime_action_calculated')})."
                    )
                for note in regime.get("explanation", []):
                    lines.append(f"- {note.replace('**', '')}")
                if not regime.get("calibrated"):
                    lines.append("- ⚠ Pesos não calibrados (`calibrated: false`).")
                lines.append("")
                lines.append("## Seleção (Modelo 2)")
                lines.append("")
                lines.append("- SecurityScore: ranking cross-sectional do universo da aba.")
                lines.append("")
        except Exception as e:
            lines.append(f"- Erro regime class model: {e}")
            lines.append("")
    lines.append("## Racional matemático")
    lines.append("")
    if is_class_model_aba(aba_result["aba_id"]):
        lines.append("| Indicador | Valor | Peso | Contribuição | Role |")
        lines.append("|-----------|-------|------|--------------|------|")
        for c in aba_result.get("componentes", []):
            lines.append(
                f"| {c['nome']} | {_fmt(c.get('valor'))} | "
                f"{_fmt(c.get('peso'), 2)} | {_fmt(c.get('contribuicao'))} | "
                f"{c.get('role', '')} |"
            )
    else:
        lines.append("| Indicador | Valor | z-score | Peso | Contribuição |")
        lines.append("|-----------|-------|---------|------|--------------|")
        for c in aba_result.get("componentes", []):
            lines.append(
                f"| {c['nome']} | {_fmt(c['valor'])} | {_fmt(c['z_score'])} | "
                f"{_fmt(c['peso'], 2)} | {_fmt(c['contribuicao'])} |"
            )
    lines.append("")
    try:
        from motor.src.calculo.models import build_models_snapshot

        models = build_models_snapshot()
        regime = models.get("regime", {})
        if regime:
            lines.append("## Regime context (educacional)")
            lines.append("")
            prob = regime.get("regime_risk_probability")
            if prob is not None:
                lines.append(
                    f"- Probabilidade logística de regime de risco elevado: **{_fmt(prob, 2)}**"
                )
            if regime.get("note"):
                lines.append(f"- Nota: {regime['note']}")
            if not regime.get("calibrated"):
                warn = regime.get("calibration_warning") or "Modelo não calibrado (`calibrated: false`)."
                lines.append(f"- ⚠ {warn}")
            elif regime.get("n_samples"):
                lines.append(f"- Calibrado com {regime['n_samples']} observações (ver `label_note`).")
            lines.append("")
    except Exception:
        pass
    lines.append("## Universo (ativos)")
    lines.append("")
    lines.append("| Ticker | S | Estágio | vs Categoria |")
    lines.append("|--------|---|---------|--------------|")
    for a in ativos:
        vs = "DIVERGE" if a.get("diverge") else "alinhado"
        lines.append(
            f"| {a['ticker']} | {_fmt(a['score_composto'])} | {a['estagio']} | {vs} |"
        )
    lines.append("")
    lines.append("---")
    lines.append("*Informação educacional. Não constitui assessoria de investimento.*")
    return "\n".join(lines)


def load_ativos_from_db(aba_id: str, data: str) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT ticker, score_composto, estagio, diverge_categoria
            FROM scores_ativo WHERE aba_id = ? AND data = ?
            """,
            (aba_id, data),
        ).fetchall()
    return [
        {
            "ticker": r["ticker"],
            "score_composto": float(r["score_composto"]),
            "estagio": r["estagio"] or "Maduro",
            "diverge": bool(r["diverge_categoria"]),
        }
        for r in rows
    ]


def write_report(
    aba_result: dict[str, Any],
    estagio_info: dict[str, Any],
    ativos: list[dict[str, Any]],
    categoria_estagio: str,
) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    aba_id = aba_result["aba_id"]
    data = aba_result["data"]
    md = build_report_markdown(aba_result, estagio_info, ativos, categoria_estagio)
    path = OUTPUT_DIR / f"relatorio_{aba_id}_{data}.md"
    path.write_text(md, encoding="utf-8")
    return path


def generate_report(aba_id: str) -> Path:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT aba_id, data, score_composto, estagio, slope, componentes_json
            FROM scores_historico WHERE aba_id = ?
            ORDER BY data DESC LIMIT 1
            """,
            (aba_id,),
        ).fetchone()
    if not row:
        raise RuntimeError(f"Sem scores para aba {aba_id}; rode o pipeline primeiro.")

    import json

    aba_result = {
        "aba_id": row["aba_id"],
        "nome": load_aba_config(aba_id).get("nome", aba_id),
        "data": row["data"],
        "score_composto": float(row["score_composto"]),
        "componentes": json.loads(row["componentes_json"]),
    }
    dom = max(aba_result["componentes"], key=lambda c: abs(c["contribuicao"]))
    aba_result["indicador_dominante"] = dom

    estagio_info = {
        "estagio": row["estagio"] or "Maduro",
        "slope": float(row["slope"] or 0),
    }
    ativos = load_ativos_from_db(aba_id, row["data"])
    return write_report(aba_result, estagio_info, ativos, estagio_info["estagio"])


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--aba", default="fi_treasury")
    args = parser.parse_args()
    path = generate_report(args.aba)
    print(path)


if __name__ == "__main__":
    main()
