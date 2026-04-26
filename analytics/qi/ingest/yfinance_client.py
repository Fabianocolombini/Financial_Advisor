"""yfinance batch OHLCV ingestor — zero-cost alternative to Polygon for dev/MVP."""

from __future__ import annotations

import datetime as dt
import time
from decimal import Decimal
from typing import Any

import yfinance as yf
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from qi.db.models import QiAsset, QiMarketPriceDaily
from qi.ids import new_cuid_like

# FRED series IDs — usar exatamente como definidos aqui
# Referência: https://fred.stlouisfed.org/series/<ID>
FRED_SERIES_CORE = [
    "GDPC1",           # Real GDP (Quarterly) — NÃO usar "GDP"
    "CPIAUCSL",        # CPI All Urban Consumers — NÃO usar "CPI"
    "FEDFUNDS",        # Federal Funds Rate
    "UNRATE",          # Unemployment Rate
    "T10Y2Y",          # 10Y-2Y Treasury Spread
    "DEXUSEU",         # USD/EUR Exchange Rate
    "VIXCLS",          # VIX (Volatility Index)
]

_BATCH_DELAY_SEC = 1.0


def _symbol_to_yf(symbol: str) -> str:
    """
    Converte para formato Yahoo quando necessário.
    - Classes de ação US: BRK.B -> BRK-B
    - Sufixos de bolsa internacional devem manter ponto: ULVR.L, ABB.SW
    """
    symbol = symbol.strip().upper()
    if "." not in symbol:
        return symbol
    base, suffix = symbol.split(".", 1)
    if suffix in {"A", "B", "C"}:
        return f"{base}-{suffix}"
    return symbol


def _load_asset_map(session: Session, symbols: list[str]) -> dict[str, str]:
    """Retorna {symbol_upper: asset_id}."""
    rows = session.execute(
        select(QiAsset.symbol, QiAsset.id).where(
            QiAsset.symbol.in_([s.upper() for s in symbols])
        )
    ).all()
    return {r[0]: r[1] for r in rows}


def _upsert_bars(
    session: Session,
    asset_id: str,
    bars: list[dict[str, Any]],
) -> int:
    """Faz upsert de uma lista de barras OHLCV em qi_market_price_daily."""
    if not bars:
        return 0
    now = dt.datetime.now(dt.timezone.utc)
    n = 0
    t = QiMarketPriceDaily.__table__
    for bar in bars:
        stmt = pg_insert(t).values(
            id=new_cuid_like(),
            asset_id=asset_id,
            trade_date=bar["trade_date"],
            open=Decimal(str(bar["open"])),
            high=Decimal(str(bar["high"])),
            low=Decimal(str(bar["low"])),
            close=Decimal(str(bar["close"])),
            volume=int(bar["volume"]),
            adjusted_close=Decimal(str(bar["close"])),
            source="YFINANCE",
            ingested_at=now,
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["asset_id", "trade_date", "source"],
            set_={
                "open": stmt.excluded.open,
                "high": stmt.excluded.high,
                "low": stmt.excluded.low,
                "close": stmt.excluded.close,
                "volume": stmt.excluded.volume,
                "adjusted_close": stmt.excluded.adjusted_close,
                "ingested_at": stmt.excluded.ingested_at,
            },
        )
        session.execute(stmt)
        n += 1
    return n


def _parse_download(data: Any, symbols: list[str]) -> dict[str, list[dict]]:
    """
    Extrai barras do DataFrame retornado por yf.download(group_by='ticker').
    Suporta tanto MultiIndex (vários tickers) quanto Index simples (1 ticker).
    """
    import pandas as pd

    result: dict[str, list[dict]] = {}
    if data is None or data.empty:
        return result

    cols = data.columns
    is_multi = isinstance(cols, pd.MultiIndex)

    for sym in symbols:
        yf_sym = _symbol_to_yf(sym)
        bars: list[dict] = []
        try:
            if is_multi:
                if yf_sym not in cols.get_level_values(0):
                    if sym not in cols.get_level_values(0):
                        continue
                    ticker_key = sym
                else:
                    ticker_key = yf_sym
                df_t = data[ticker_key].dropna(how="all")
            else:
                # Ticker único: data tem apenas as colunas OHLCV
                df_t = data.dropna(how="all")

            for idx, row in df_t.iterrows():
                try:
                    trade_date = idx.date() if hasattr(idx, "date") else idx
                    o = float(row.get("Open", row.get("open", 0)) or 0)
                    h = float(row.get("High", row.get("high", 0)) or 0)
                    lo = float(row.get("Low", row.get("low", 0)) or 0)
                    c = float(row.get("Close", row.get("close", 0)) or 0)
                    v = int(row.get("Volume", row.get("volume", 0)) or 0)
                    if c <= 0:
                        continue
                    bars.append(
                        {
                            "trade_date": trade_date,
                            "open": o,
                            "high": h,
                            "low": lo,
                            "close": c,
                            "volume": v,
                        }
                    )
                except Exception:
                    continue
        except Exception:
            continue
        if bars:
            result[sym.upper()] = bars
    return result


def ingest_prices_yfinance(
    session: Session,
    tickers: list[str],
    start_date: dt.date,
    end_date: dt.date,
    batch_size: int = 100,
) -> dict[str, Any]:
    """
    Faz upsert de OHLCV diário via yfinance para os tickers fornecidos.

    Retorna:
        {
            "tickers_ok": int,
            "tickers_failed": int,
            "records_upserted": int,
            "errors": list[str],
        }
    """
    if not tickers:
        return {"tickers_ok": 0, "tickers_failed": 0, "records_upserted": 0, "errors": []}

    asset_map = _load_asset_map(session, tickers)
    tickers_upper = [s.upper() for s in tickers]

    tickers_ok = 0
    tickers_failed = 0
    records_upserted = 0
    errors: list[str] = []

    start_str = start_date.isoformat()
    end_str = (end_date + dt.timedelta(days=1)).isoformat()

    batches = [tickers_upper[i: i + batch_size] for i in range(0, len(tickers_upper), batch_size)]
    n_batches = len(batches)

    for batch_num, batch in enumerate(batches, start=1):
        if batch_num > 1:
            time.sleep(_BATCH_DELAY_SEC)

        yf_batch = [_symbol_to_yf(s) for s in batch]
        print(
            f"  yfinance lote {batch_num}/{n_batches} "
            f"({len(batch)} tickers, {start_str} → {end_str})..."
        )

        try:
            data = yf.download(
                tickers=" ".join(yf_batch),
                start=start_str,
                end=end_str,
                group_by="ticker",
                auto_adjust=True,
                progress=False,
                threads=True,
            )
        except Exception as exc:
            msg = f"Lote {batch_num}: download falhou — {exc}"
            print(f"    [WARN] {msg}")
            errors.append(msg)
            tickers_failed += len(batch)
            continue

        parsed = _parse_download(data, batch)

        for sym in batch:
            asset_id = asset_map.get(sym)
            if not asset_id:
                errors.append(f"{sym}: não encontrado em qi_asset")
                tickers_failed += 1
                continue

            bars = parsed.get(sym)
            if not bars:
                tickers_failed += 1
                continue

            n = _upsert_bars(session, asset_id, bars)
            records_upserted += n
            tickers_ok += 1

        session.flush()
        print(f"    Lote {batch_num}: +{sum(len(v) for v in parsed.values())} barras (Σ {records_upserted})")

    return {
        "tickers_ok": tickers_ok,
        "tickers_failed": tickers_failed,
        "records_upserted": records_upserted,
        "errors": errors,
    }
