#!/usr/bin/env python3
"""Export latest motor scores for the Next.js home dashboard."""

from __future__ import annotations

import json
import sys
from pathlib import Path

MOTOR_ROOT = Path(__file__).resolve().parents[1]
OUTPUT = MOTOR_ROOT / "data" / "dashboard-snapshot.json"


def stage_en(estagio: str | None) -> str:
    mapping = {
        "Ascendente": "Accumulate",
        "Maduro": "Hold",
        "Descendente": "Reduce",
    }
    return mapping.get(estagio or "", "Hold")


def main() -> None:
    import datetime as dt

    from motor.src.config.aba_class_map import CLASS_LABELS, class_id_for_aba
    from motor.src.config_loader import load_aba_config
    from motor.src.db.connection import get_connection, init_db
    from motor.src.dates import motor_as_of_date, motor_snapshot_timestamps
    from motor.src.decisao.snapshot_quality import check_snapshot_quality
    from motor.src.decisao.ticker_performance import enrich_ticker_performance
    from motor.src.decisao.validacao import (
        dominant_component,
        validate_class_entry,
        validate_ticker_entry,
    )

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
            class_id = class_id_for_aba(aba_id)
            componentes = json.loads(row["componentes_json"])
            top_inds = sorted(
                componentes,
                key=lambda c: abs(c.get("contribuicao", 0)),
                reverse=True,
            )[:5]
            dominant = dominant_component(componentes)
            validation = validate_class_entry(
                row["estagio"] or "Maduro",
                float(row["score_composto"]),
                dominant,
            )
            snapshot["classes"][class_id] = {
                "abaId": aba_id,
                "classId": class_id,
                "label": CLASS_LABELS.get(class_id, class_id),
                "nome": load_aba_config(aba_id).get("nome", aba_id),
                "data": row["data"],
                "score": float(row["score_composto"]),
                "stage": row["estagio"],
                "stageLabel": stage_en(row["estagio"]),
                "entryValidated": validation["entryValidated"],
                "rationale": validation["rationale"],
                "dominantIndicator": validation["dominantIndicator"],
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

        class_scores: dict[str, float] = {}
        class_stages: dict[str, str] = {}
        for cls in snapshot["classes"].values():
            class_scores[cls["classId"]] = cls["score"]
            class_stages[cls["classId"]] = cls.get("stage") or "Maduro"

        for row in ativo_rows:
            ticker = row["ticker"].upper()
            class_id = class_id_for_aba(row["aba_id"])
            componentes = json.loads(row["componentes_json"])
            top_inds = sorted(
                componentes,
                key=lambda c: abs(c.get("contribuicao", 0)),
                reverse=True,
            )[:5]
            dominant = dominant_component(componentes)
            score_ativo = float(row["score_composto"])
            score_aba = class_scores.get(class_id, 0.0)
            estagio_aba = class_stages.get(class_id, "Maduro")
            diverge = bool(row["diverge_categoria"])
            validation = validate_ticker_entry(
                estagio_aba,
                row["estagio"] or "Maduro",
                score_aba,
                score_ativo,
                diverge,
                dominant,
            )
            snapshot["tickers"][ticker] = enrich_ticker_performance(
                {
                "symbol": ticker,
                "abaId": row["aba_id"],
                "classId": class_id,
                "data": row["data"],
                "score": score_ativo,
                "stage": row["estagio"],
                "stageLabel": stage_en(row["estagio"]),
                "divergesFromClass": diverge,
                "entryValidated": validation["entryValidated"],
                "rationale": validation["rationale"],
                "dominantIndicator": validation["dominantIndicator"],
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
            },
            )

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

    quality = check_snapshot_quality(snapshot)
    snapshot["quality"] = quality

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False), encoding="utf-8")
    print(
        f"[export_dashboard] OK → {OUTPUT} "
        f"({len(snapshot['tickers'])} tickers, {len(snapshot['classes'])} classes)"
    )
    if quality["warnings"]:
        for w in quality["warnings"]:
            print(f"[export_dashboard] WARN: {w}", file=sys.stderr)
    if not quality["ok"]:
        for issue in quality["issues"]:
            print(f"[export_dashboard] ISSUE: {issue}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"[export_dashboard] ERRO: {e}", file=sys.stderr)
        sys.exit(1)
