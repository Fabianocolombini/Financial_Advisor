"""Fetch FRED series observations (same contract as TS `lib/market/fred.ts`)."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Iterator

import httpx

_FRED_BASE = "https://api.stlouisfed.org/fred"


@dataclass
class FredObservation:
    date: str
    value: float
    raw: dict[str, str]


def fetch_fred_observations(
    api_key: str,
    series_id: str,
    observation_start: str,
) -> list[FredObservation]:
    url = "https://api.stlouisfed.org/fred/series/observations"
    params = {
        "series_id": series_id,
        "api_key": api_key,
        "file_type": "json",
        "observation_start": observation_start,
        "sort_order": "asc",
    }
    with httpx.Client(timeout=60.0) as client:
        res = client.get(url, params=params)
        res.raise_for_status()
        data = res.json()
    obs = data.get("observations") or []
    out: list[FredObservation] = []
    for row in obs:
        v = row.get("value", "")
        if v in (".", ""):
            continue
        try:
            n = float(v)
        except ValueError:
            continue
        if not (n == n):  # NaN
            continue
        d = row.get("date", "")
        out.append(FredObservation(date=d, value=n, raw={"date": d, "value": str(v)}))
    return out


def series_metadata(api_key: str, series_id: str) -> dict[str, Any]:
    url = "https://api.stlouisfed.org/fred/series"
    params = {"series_id": series_id, "api_key": api_key, "file_type": "json"}
    with httpx.Client(timeout=30.0) as client:
        res = client.get(url, params=params)
        res.raise_for_status()
        seriess = res.json().get("seriess") or []
        if not seriess:
            return {}
        s0 = seriess[0]
        return {
            "title": s0.get("title"),
            "frequency": s0.get("frequency"),
            "units": s0.get("units"),
            "seasonal_adjustment": s0.get("seasonal_adjustment"),
        }


def fetch_category_children(api_key: str, category_id: int) -> list[dict[str, Any]]:
    """Subcategorias diretas (FRED `/fred/category/children`)."""
    url = f"{_FRED_BASE}/category/children"
    params = {
        "category_id": category_id,
        "api_key": api_key,
        "file_type": "json",
    }
    with httpx.Client(timeout=60.0) as client:
        res = client.get(url, params=params)
        res.raise_for_status()
        return res.json().get("categories") or []


def iter_category_series_pages(
    api_key: str, category_id: int, *, limit: int = 1000
) -> Iterator[list[dict[str, Any]]]:
    """Páginas de séries associadas a uma categoria (`/fred/category/series`)."""
    offset = 0
    url = f"{_FRED_BASE}/category/series"
    with httpx.Client(timeout=120.0) as client:
        while True:
            params = {
                "category_id": category_id,
                "api_key": api_key,
                "file_type": "json",
                "limit": limit,
                "offset": offset,
            }
            res = client.get(url, params=params)
            res.raise_for_status()
            batch = res.json().get("seriess") or []
            if not batch:
                break
            yield batch
            if len(batch) < limit:
                break
            offset += limit


def discover_fred_series_catalog(
    api_key: str,
    *,
    root_category_id: int = 0,
    max_series: int | None = None,
    request_delay_sec: float = 0.55,
    progress_every: int = 1000,
) -> list[dict[str, str]]:
    """
    Percorre a árvore de categorias FRED (BFS), deduplica por `series_id`.
    Pode levar muito tempo e muitas chamadas à API; use `max_series` no MVP.
    Respeite o limite da sua chave (ex.: ~120 req/min).
    """
    seen: dict[str, str] = {}
    queue: list[int] = [root_category_id]
    visited_cat: set[int] = set()

    def pause() -> None:
        if request_delay_sec > 0:
            time.sleep(request_delay_sec)

    n_cat = 0
    while queue:
        cid = queue.pop(0)
        if cid in visited_cat:
            continue
        visited_cat.add(cid)
        n_cat += 1
        if n_cat % 200 == 0:
            print(
                f"FRED discovery: {len(visited_cat)} categorias visitadas, "
                f"{len(seen)} séries únicas até agora…"
            )

        pause()
        try:
            children = fetch_category_children(api_key, cid)
        except Exception:
            children = []
        for ch in children:
            ch_id = ch.get("id")
            if ch_id is None:
                continue
            try:
                qid = int(ch_id)
            except (TypeError, ValueError):
                continue
            if qid not in visited_cat:
                queue.append(qid)

        pause()
        try:
            for page in iter_category_series_pages(api_key, cid):
                pause()
                for s in page:
                    sid = s.get("id")
                    if not sid or not isinstance(sid, str):
                        continue
                    title = s.get("title")
                    if sid not in seen:
                        seen[sid] = (title.strip() if isinstance(title, str) else "") or sid
                        if progress_every and len(seen) % progress_every == 0:
                            print(f"FRED discovery: {len(seen)} séries únicas…")
                    if max_series is not None and len(seen) >= max_series:
                        out = [{"external_id": k, "title": v} for k, v in sorted(seen.items())]
                        return out[:max_series]
        except Exception:
            continue

    out = [{"external_id": k, "title": v} for k, v in sorted(seen.items())]
    if max_series is not None:
        return out[:max_series]
    return out
