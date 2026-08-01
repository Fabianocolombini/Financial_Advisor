#!/usr/bin/env python3
"""Export latest motor scores for the Next.js home dashboard."""

from __future__ import annotations

import json
import sys
from pathlib import Path

MOTOR_ROOT = Path(__file__).resolve().parents[1]
OUTPUT = MOTOR_ROOT / "data" / "dashboard-snapshot.json"

# Motor aba → catalog classId (watchlist grouping)
ABA_TO_CLASS: dict[str, str] = {
    "taxas": "fi_treasury",
    "credito_alternativo": "alt_bdc",
}

CLASS_LABELS: dict[str, str] = {
    "fi_treasury": "Treasuries",
    "alt_bdc": "Alternative Credit (BDC)",
    "cash_equivalents": "Cash",
    "fi_ig": "IG Bonds",
    "fi_hy": "High Yield",
    "fi_tips": "TIPS",
    "fi_preferred": "Preferred",
    "us_equity": "US Equity",
    "intl_equity": "Intl Equity",
    "em_equity": "Emerging Markets",
    "real_estate": "REITs",
    "commodities_precious": "Precious Metals",
    "commodities_energy": "Energy",
    "energy_mlp": "MLP",
    "healthcare_biotech": "Biotech",
    "alt_infrastructure": "Infrastructure",
    "currencies": "FX",
    "unclassified": "Other",
}


def stage_en(estagio: str | None) -> str:
    mapping = {
        "Ascendente": "Accumulate",
        "Maduro": "Hold",
        "Descendente": "Reduce",
    }
    return mapping.get(estagio or "", "Hold")


def main() -> None:
    import datetime as dt

    from motor.src.db.connection import get_connection, init_db
    from motor.src.config_loader import load_aba_config
    from motor.src.dates import motor_as_of_date, motor_snapshot_timestamps

    init_db()

    expected_as_of = motor_as_of_date()
    meta = motor_snapshot_timestamps(expected_as_of)

    snapshot: dict = {
        "asOf": None,
        "asOfConvention": meta["asOfConvention"],
        "updatedAt": meta["updatedAt"],
        "classes": {},
        "tickers": {},
    }

    with get_connection() as conn:
        aba_rows = conn.execute(
            """
            SELECT sh.aba_id, sh.data, sh.score_composto, sh.estagio, sh.componentes_json
            FROM scores_historico sh
            INNER JOIN (
              SELECT aba_id, MAX(data) AS md FROM scores_historico GROUP BY aba_id
            ) latest ON sh.aba_id = latest.aba_id AND sh.data = latest.md
            """
        ).fetchall()

        for row in aba_rows:
            aba_id = row["aba_id"]
            class_id = ABA_TO_CLASS.get(aba_id, aba_id)
            componentes = json.loads(row["componentes_json"])
            top_inds = sorted(
                componentes,
                key=lambda c: abs(c.get("contribuicao", 0)),
                reverse=True,
            )[:5]
            snapshot["classes"][class_id] = {
                "abaId": aba_id,
                "classId": class_id,
                "label": CLASS_LABELS.get(class_id, class_id),
                "nome": load_aba_config(aba_id).get("nome", aba_id),
                "data": row["data"],
                "score": float(row["score_composto"]),
                "stage": row["estagio"],
                "stageLabel": stage_en(row["estagio"]),
                "indicators": [
                    {
                        "id": c["id"],
                        "name": c.get("nome", c["id"]),
                        "value": c.get("valor"),
                        "zScore": c.get("z_ajustado"),
                        "contribution": c.get("contribuicao"),
                    }
                    for c in top_inds
                ],
            }

        ativo_rows = conn.execute(
            """
            SELECT sa.aba_id, sa.ticker, sa.data, sa.score_composto, sa.estagio,
                   sa.diverge_categoria, sa.componentes_json
            FROM scores_ativo sa
            INNER JOIN (
              SELECT aba_id, ticker, MAX(data) AS md FROM scores_ativo
              GROUP BY aba_id, ticker
            ) latest ON sa.aba_id = latest.aba_id
              AND sa.ticker = latest.ticker AND sa.data = latest.md
            """
        ).fetchall()

        for row in ativo_rows:
            ticker = row["ticker"].upper()
            class_id = ABA_TO_CLASS.get(row["aba_id"], row["aba_id"])
            componentes = json.loads(row["componentes_json"])
            top_inds = sorted(
                componentes,
                key=lambda c: abs(c.get("contribuicao", 0)),
                reverse=True,
            )[:5]
            snapshot["tickers"][ticker] = {
                "symbol": ticker,
                "abaId": row["aba_id"],
                "classId": class_id,
                "data": row["data"],
                "score": float(row["score_composto"]),
                "stage": row["estagio"],
                "stageLabel": stage_en(row["estagio"]),
                "divergesFromClass": bool(row["diverge_categoria"]),
                "indicators": [
                    {
                        "id": c["id"],
                        "name": c.get("nome", c["id"]),
                        "value": c.get("valor"),
                        "zScore": c.get("z_ajustado"),
                        "contribution": c.get("contribuicao"),
                    }
                    for c in top_inds
                ],
            }

    # asOf = latest score date in DB, capped at expected previous-day close
    data_dates: list[dt.date] = []
    for cls in snapshot["classes"].values():
        try:
            data_dates.append(dt.date.fromisoformat(cls["data"]))
        except ValueError:
            pass
    for tick in snapshot["tickers"].values():
        try:
            data_dates.append(dt.date.fromisoformat(tick["data"]))
        except ValueError:
            pass
    if data_dates:
        latest = max(data_dates)
        snapshot["asOf"] = min(latest, expected_as_of).isoformat()
    else:
        snapshot["asOf"] = expected_as_of.isoformat()

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[export_dashboard] OK → {OUTPUT} ({len(snapshot['tickers'])} tickers)")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"[export_dashboard] ERRO: {e}", file=sys.stderr)
        sys.exit(1)
