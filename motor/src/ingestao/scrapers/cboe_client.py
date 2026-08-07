"""CBOE equity put/call ratio and TLT IV proxy."""

from __future__ import annotations

from motor.src.ingestao.scrapers.base import fetch_text, parse_first_float, store_scalar

_PC_URL = "https://cdn.cboe.com/api/global/us_indices/daily_prices/put_call_ratio.csv"
_TLT_IV_URL = "https://www.cboe.com/us/options/market_statistics/symbol/tlt/"


def ingest(conn=None) -> dict:
    out: dict = {"ok": False}
    csv = fetch_text(_PC_URL)
    if csv:
        lines = [ln for ln in csv.strip().splitlines() if ln and not ln.startswith("#")]
        if len(lines) >= 2:
            last = lines[-1].split(",")
            try:
                ratio = float(last[-1])
                store_scalar("cboe", "put_call_ratio", ratio, conn=conn)
                out["put_call_ratio"] = ratio
                out["ok"] = True
            except ValueError:
                pass
    html = fetch_text(_TLT_IV_URL)
    if html:
        iv = parse_first_float(html, r"implied volatility[^0-9]*(\d+\.?\d*)")
        if iv is not None:
            store_scalar("cboe", "tlt_iv_proxy", iv, conn=conn)
            out["tlt_iv_proxy"] = iv
            out["ok"] = True
    if not out.get("ok"):
        out["error"] = "CBOE data unavailable"
    return out
