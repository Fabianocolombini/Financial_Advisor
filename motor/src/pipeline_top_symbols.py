"""Score ticker-level motor data for a list of symbols (top-90% liquidity batch)."""

from __future__ import annotations

from motor.src.calculo.indicadores_tecnicos import persist_tecnicos
from motor.src.calculo.score_composto import (
    compute_ativo_score,
    persist_ativo_score,
)
from motor.src.config.aba_class_map import benchmark_for_class, class_id_for_aba
from motor.src.config_loader import is_cash_aba, is_treasury_aba, load_aba_config
from motor.src.decisao.estagio import compute_estagio_aba, diverge_categoria, estagio_ativo
from motor.src.decisao.validacao import dominant_component, validate_ticker_entry
from motor.src.db.connection import init_db
from motor.src.ingestao.yfinance_client import ingest_ticker


def score_symbol_list(
    aba_id: str,
    symbols: list[str],
    start: str = "2019-01-01",
) -> dict:
    init_db()
    aba = load_aba_config(aba_id)
    aba_id = aba.get("id", aba_id)
    class_id = class_id_for_aba(aba_id)
    default_bench = benchmark_for_class(class_id).upper()

    universo_map = {
        item["ticker"].upper(): item for item in aba.get("universo", [])
    }

    estagio_info = compute_estagio_aba(aba_id)
    from motor.src.calculo.score_composto import compute_aba_score

    aba_result = compute_aba_score(aba_id)
    cat_score = aba_result["score_composto"]
    cat_estagio = (
        aba_result.get("estagio", estagio_info["estagio"])
        if is_cash_aba(aba_id) or is_treasury_aba(aba_id)
        else estagio_info["estagio"]
    )

    universe_tickers = [item["ticker"].upper() for item in aba.get("universo", [])]

    scored: list[dict] = []
    benches_ingested: set[str] = set()
    prepared: list[str] = []

    for raw in symbols:
        ticker = raw.strip().upper()
        if not ticker:
            continue
        meta = universo_map.get(ticker, {})
        bench = (meta.get("benchmark") or default_bench).upper()

        ingest_ticker(ticker, start)
        if bench and bench != ticker and bench not in benches_ingested:
            ingest_ticker(bench, start)
            benches_ingested.add(bench)
        persist_tecnicos(ticker, bench, aba_id=aba_id)
        prepared.append(ticker)

    cash_batch: dict[str, dict] = {}
    if is_cash_aba(aba_id) and prepared:
        from motor.src.calculo.cash_security_score import compute_cash_security_batch

        cash_batch = compute_cash_security_batch(
            prepared,
            universe_tickers=universe_tickers,
        )
    elif is_treasury_aba(aba_id) and prepared:
        from motor.src.calculo.treasury_security_score import compute_treasury_security_batch

        cash_batch = compute_treasury_security_batch(
            prepared,
            universe_tickers=universe_tickers,
        )

    for ticker in prepared:
        meta = universo_map.get(ticker, {})
        bench = (meta.get("benchmark") or default_bench).upper()
        edgar_metric = meta.get("edgar_metric")

        if is_cash_aba(aba_id) or is_treasury_aba(aba_id):
            ativo = cash_batch[ticker]
            est = ativo.get("estagio") or estagio_ativo(ativo["score_composto"])
        else:
            ativo = compute_ativo_score(aba_id, ticker, bench, edgar_metric)
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
        scored.append(
            {
                "ticker": ticker,
                "score": ativo["score_composto"],
                "stage": est,
                "entryValidated": validation["entryValidated"],
            }
        )

    return {
        "aba_id": aba_id,
        "class_id": class_id,
        "symbols_requested": len(symbols),
        "symbols_scored": len(scored),
        "tickers": scored,
    }
