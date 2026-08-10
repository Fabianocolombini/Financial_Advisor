"""On-demand motor pipeline for a single watchlisted symbol."""

from __future__ import annotations

from motor.src.calculo.indicadores_tecnicos import persist_tecnicos
from motor.src.calculo.score_composto import (
    compute_aba_score,
    compute_ativo_score,
    persist_aba_score,
    persist_ativo_score,
)
from motor.src.config.aba_class_map import benchmark_for_class, resolve_aba_id
from motor.src.config_loader import is_class_model_aba, load_aba_config
from motor.src.decisao.estagio import (
    compute_estagio_aba,
    diverge_categoria,
    estagio_ativo,
)
from motor.src.decisao.validacao import dominant_component, validate_ticker_entry
from motor.src.db.connection import get_connection, init_db
from motor.src.ingestao.fred_client import ingest_for_aba
from motor.src.ingestao.yfinance_client import ingest_ticker


def run_symbol_pipeline(
    symbol: str,
    class_id: str,
    start: str = "2019-01-01",
) -> dict:
    """
    Ingest full EOD history + technicals for one symbol, refresh class macro score,
    and persist ticker score for latest EOD (previous trading day convention).
    """
    aba_id = resolve_aba_id(class_id)
    if not aba_id:
        raise ValueError(f"No motor aba configured for class '{class_id}'")

    ticker = symbol.strip().upper()
    benchmark = benchmark_for_class(class_id).upper()
    init_db()

    price_rows = ingest_ticker(ticker, start)
    bench_rows = ingest_ticker(benchmark, start) if benchmark else 0
    tec_rows = persist_tecnicos(ticker, benchmark, aba_id=aba_id)

    ingest_for_aba(aba_id, start)
    aba_result = compute_aba_score(aba_id)
    persist_aba_score(aba_result, estagio=aba_result.get("estagio"))

    estagio_info = compute_estagio_aba(aba_id)
    cat_estagio = (
        aba_result.get("estagio", estagio_info["estagio"])
        if is_class_model_aba(aba_id)
        else estagio_info["estagio"]
    )
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

    if is_class_model_aba(aba_id):
        aba = load_aba_config(aba_id)
        universe_tickers = [item["ticker"].upper() for item in aba.get("universo", [])]
        from motor.src.calculo.class_model_registry import compute_security_batch

        ativo = compute_security_batch(
            aba_id,
            [ticker],
            universe_tickers=universe_tickers,
        )[ticker]
        est = ativo.get("estagio") or estagio_ativo(ativo["score_composto"])
    else:
        ativo = compute_ativo_score(aba_id, ticker, benchmark)
        est = estagio_ativo(ativo["score_composto"])
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

    return {
        "ok": True,
        "symbol": ticker,
        "classId": class_id,
        "abaId": aba_id,
        "benchmark": benchmark,
        "priceRows": price_rows,
        "benchmarkRows": bench_rows,
        "technicalRows": tec_rows,
        "asOf": ativo["data"],
        "score": ativo["score_composto"],
        "stage": est,
        "entryValidated": validation["entryValidated"],
        "classScore": cat_score,
        "classStage": cat_estagio,
    }
