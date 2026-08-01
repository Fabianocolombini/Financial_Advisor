"""Generate markdown report for an aba."""

from __future__ import annotations

import datetime as dt
from pathlib import Path
from typing import Any

from motor.src.config_loader import load_aba_config
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
    lines.append("## Racional matemático")
    lines.append("")
    lines.append("| Indicador | Valor | z-score | Peso | Contribuição |")
    lines.append("|-----------|-------|---------|------|--------------|")
    for c in aba_result.get("componentes", []):
        lines.append(
            f"| {c['nome']} | {_fmt(c['valor'])} | {_fmt(c['z_score'])} | "
            f"{_fmt(c['peso'], 2)} | {_fmt(c['contribuicao'])} |"
        )
    lines.append("")
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
