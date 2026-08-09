"""Generate markdown report for an aba."""

from __future__ import annotations

import datetime as dt
from pathlib import Path
from typing import Any

from motor.src.config_loader import is_cash_aba, is_treasury_aba, load_aba_config
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
            "- SecurityScore: percentis cross-sectional (liquidez, σ20, |Δ50|). "
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
            "- SecurityScore: tendência + RSI + volume − COT crowding. "
            "RSI mantido — vol genuína em TLT/IEF/SHY."
        )
        lines.append("")
    lines.append("## Racional matemático")
    lines.append("")
    if is_cash_aba(aba_result["aba_id"]) or is_treasury_aba(aba_result["aba_id"]):
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
