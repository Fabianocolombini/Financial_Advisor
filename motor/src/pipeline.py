"""Full motor pipeline: ingest → calculate → stage → report."""

from __future__ import annotations

import argparse
import json
import sys

from motor.src.calculo.indicadores_tecnicos import compute_aba_tecnicos
from motor.src.calculo.score_composto import (
    backfill_aba_scores,
    compute_aba_score,
    compute_ativo_score,
    persist_aba_score,
    persist_ativo_score,
)
from motor.src.config_loader import is_cash_aba, is_treasury_aba, load_aba_config
from motor.src.decisao.estagio import (
    compute_estagio_aba,
    diverge_categoria,
    estagio_ativo,
)
from motor.src.decisao.validacao import dominant_component, validate_ticker_entry
from motor.src.db.connection import get_connection, init_db
from motor.src.ingestao.edgar_client import ingest_aba_edgar
from motor.src.ingestao.fred_client import ingest_for_aba
from motor.src.ingestao.yfinance_client import ingest_aba_universe
from motor.src.output.gerar_relatorio import generate_report


def run_pipeline(
    aba_id: str,
    start: str = "2019-01-01",
    *,
    score_universe: bool = True,
) -> dict:
    init_db()
    aba = load_aba_config(aba_id)
    aba_id = aba.get("id", aba_id)
    print(f"[motor] Ingest FRED para {aba_id}...")
    fred_counts = ingest_for_aba(aba_id, start)

    yf_counts: dict[str, int] = {}
    edgar_results: dict = {}
    tec_counts: dict[str, int] = {}
    ativos_out: list[dict] = []

    if score_universe:
        print(f"[motor] Ingest yfinance universo...")
        yf_counts = ingest_aba_universe(aba_id, start)
        if any(item.get("edgar_metric") for item in aba.get("universo", [])):
            print(f"[motor] Ingest EDGAR...")
            edgar_results = ingest_aba_edgar(aba_id)
        print(f"[motor] Indicadores técnicos...")
        tec_counts = compute_aba_tecnicos(aba_id)
    else:
        print(f"[motor] Skipping universe ingest (class macro only)")

    print(f"[motor] Score aba (backfill histórico)...")
    backfill_n = backfill_aba_scores(aba_id, days=120)
    aba_result = compute_aba_score(aba_id)
    persist_aba_score(aba_result, estagio=aba_result.get("estagio"))

    estagio_info = compute_estagio_aba(aba_id)
    if is_cash_aba(aba_id) or is_treasury_aba(aba_id):
        cat_estagio = aba_result.get("estagio", estagio_info["estagio"])
        estagio_info["estagio"] = cat_estagio
        estagio_info["regime_action"] = aba_result.get("regime_action")
    else:
        cat_estagio = estagio_info["estagio"]

    with get_connection() as conn:
        conn.execute(
            """
            UPDATE scores_historico SET estagio = ?, slope = ?
            WHERE aba_id = ? AND data = ?
            """,
            (
                cat_estagio,
                estagio_info["slope"],
                aba_id,
                aba_result["data"],
            ),
        )
        conn.commit()

    cat_score = aba_result["score_composto"]

    if score_universe:
        universe_tickers = [item["ticker"].upper() for item in aba.get("universo", [])]
        batch: dict[str, dict] = {}
        if is_cash_aba(aba_id):
            from motor.src.calculo.cash_security_score import compute_cash_security_batch

            batch = compute_cash_security_batch(
                universe_tickers,
                universe_tickers=universe_tickers,
            )
        elif is_treasury_aba(aba_id):
            from motor.src.calculo.treasury_security_score import compute_treasury_security_batch

            batch = compute_treasury_security_batch(
                universe_tickers,
                universe_tickers=universe_tickers,
            )
        for item in aba.get("universo", []):
            ticker = item["ticker"].upper()
            bench = (item.get("benchmark") or "").upper()
            if is_cash_aba(aba_id) or is_treasury_aba(aba_id):
                ativo = batch[ticker]
            else:
                ativo = compute_ativo_score(
                    aba_id,
                    ticker,
                    bench,
                    item.get("edgar_metric"),
                )
            est = ativo.get("estagio") or estagio_ativo(ativo["score_composto"])
            div = diverge_categoria(cat_estagio, est, cat_score, ativo["score_composto"])
            validation = validate_ticker_entry(
                cat_estagio,
                est,
                cat_score,
                ativo["score_composto"],
                div,
                dominant_component(ativo["componentes"]),
            )
            persist_ativo_score(aba_id, ativo, est, div)
            ativos_out.append(
                {
                    "ticker": ticker,
                    "estagio": est,
                    "diverge": div,
                    "score": ativo["score_composto"],
                    "entryValidated": validation["entryValidated"],
                }
            )

    report_path = None
    if score_universe:
        print(f"[motor] Relatório...")
        report_path = generate_report(aba_id)

    return {
        "aba_id": aba_id,
        "score_composto": aba_result["score_composto"],
        "estagio": cat_estagio,
        "slope": estagio_info["slope"],
        "fred_points": sum(fred_counts.values()),
        "backfill_scores": backfill_n,
        "yf_tickers": len(yf_counts),
        "tecnicos": tec_counts,
        "edgar": edgar_results,
        "ativos": ativos_out,
        "report": str(report_path) if report_path else None,
        "score_universe": score_universe,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Motor pipeline")
    parser.add_argument("--aba", default="fi_treasury")
    parser.add_argument("--start", default="2019-01-01")
    parser.add_argument(
        "--score-universe",
        action=argparse.BooleanOptionalAction,
        default=True,
    )
    args = parser.parse_args()
    try:
        result = run_pipeline(
            args.aba,
            args.start,
            score_universe=args.score_universe,
        )
        print(json.dumps(result, indent=2, ensure_ascii=False))
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
