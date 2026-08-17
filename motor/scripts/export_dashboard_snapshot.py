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
        "ForteDescendente": "Strong Reduce",
    }
    return mapping.get(estagio or "", "Hold")


def _as_float(v: object) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _indicator_numeric_value(c: dict) -> float | None:
    for key in (
        "valor",
        "value",
        "percentile_cs",
        "percentile_0_1",
        "signal_0_1",
        "penalty_0_1",
        "z_score",
        "z_ajustado",
        "hedge_fit",
        "cape_cheap",
        "er_contrib_0_1",
        "pc_contra",
        "aaii_contra",
        "naaim_contra",
    ):
        parsed = _as_float(c.get(key))
        if parsed is not None:
            return parsed
    return None


def _indicator_export(c: dict) -> dict:
    raw = _as_float(c.get("valor"))
    if raw is None:
        raw = _as_float(c.get("value"))
    percentile = None
    for key in ("percentile_cs", "percentile_0_1", "signal_0_1"):
        percentile = _as_float(c.get(key))
        if percentile is not None:
            break
    weight = _as_float(c.get("peso") if c.get("peso") is not None else c.get("weight"))
    inverted = c.get("inverte_percentil")
    row = {
        "id": c["id"],
        "name": c.get("nome", c.get("name", c["id"])),
        "value": raw if raw is not None else _indicator_numeric_value(c),
        "percentile": percentile,
        "weight": weight,
        "inverted": bool(inverted) if inverted is not None else None,
        "zScore": c.get("z_ajustado") if c.get("z_ajustado") is not None else c.get("z_score"),
        "contribution": c.get("contribuicao"),
    }
    if c.get("is_proxy"):
        row["isProxy"] = True
        row["proxyRationale"] = c.get("proxy_rationale", "")
    return row


def _merge_indicator_exports(existing: list[dict], extra: list[dict]) -> list[dict]:
    by_id: dict[str, dict] = {row["id"]: row for row in existing}
    for row in extra:
        prev = by_id.get(row["id"])
        if prev is None or (prev.get("value") is None and row.get("value") is not None):
            by_id[row["id"]] = row
    return sorted(
        by_id.values(),
        key=lambda r: abs(r.get("contribution") or 0),
        reverse=True,
    )


def main() -> None:
    import datetime as dt

    from motor.src.config.aba_class_map import (
        ABA_LEGACY_ALIASES,
        CLASS_LABELS,
        class_id_for_aba,
    )
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

        # taxas + fi_treasury both map to fi_treasury — prefer newer date + canonical aba_id
        by_class: dict[str, object] = {}
        for row in aba_rows:
            class_id = class_id_for_aba(row["aba_id"])
            prev = by_class.get(class_id)
            if prev is None:
                by_class[class_id] = row
                continue
            prev_row = prev
            canonical = 0 if row["aba_id"] in ABA_LEGACY_ALIASES else 1
            prev_canonical = 0 if prev_row["aba_id"] in ABA_LEGACY_ALIASES else 1
            if (row["data"], canonical) > (prev_row["data"], prev_canonical):
                by_class[class_id] = row

        from motor.src.config_loader import is_class_model_aba
        from motor.src.calculo.class_model_registry import export_regime_model_snapshot

        regime_models: dict[str, dict] = {}
        for row in by_class.values():
            aba_id = row["aba_id"]
            class_id = class_id_for_aba(aba_id)
            componentes = json.loads(row["componentes_json"])
            top_inds = sorted(
                componentes,
                key=lambda c: abs(c.get("contribuicao", 0)),
                reverse=True,
            )[:5]
            dominant = dominant_component(componentes)

            regime_model = None
            if is_class_model_aba(aba_id):
                try:
                    regime_model = export_regime_model_snapshot(aba_id)
                except Exception as e:
                    print(f"[export_dashboard] WARN: regime model {aba_id}: {e}", file=sys.stderr)
            if regime_model:
                regime_models[class_id] = regime_model

            # `score` is the persisted daily series (used for history and estágio),
            # while the regime model is recomputed live. Decide on the live score so
            # the action can never contradict the number shown beside it.
            model_score = (regime_model or {}).get("score")
            allocation_score = (
                float(model_score)
                if isinstance(model_score, (int, float))
                else float(row["score_composto"])
            )
            validation = validate_class_entry(
                row["estagio"] or "Maduro",
                allocation_score,
                dominant,
                aba_id=aba_id,
                regime_action=(regime_model or {}).get("action"),
            )
            snapshot["classes"][class_id] = {
                "abaId": aba_id,
                "classId": class_id,
                "label": CLASS_LABELS.get(class_id, class_id),
                "nome": load_aba_config(aba_id).get("nome", aba_id),
                "data": row["data"],
                "score": float(row["score_composto"]),
                "allocationScore": allocation_score,
                "stage": row["estagio"],
                "stageLabel": stage_en(row["estagio"]),
                "entryValidated": validation["entryValidated"],
                "scoreDomain": validation["scoreDomain"],
                "allocationAction": validation["allocationAction"],
                "rationale": validation["rationale"],
                "dominantIndicator": validation["dominantIndicator"],
                "indicators": [_indicator_export(c) for c in top_inds],
                "allIndicators": [
                    _indicator_export(c)
                    for c in sorted(
                        componentes,
                        key=lambda c: abs(c.get("contribuicao", 0)),
                        reverse=True,
                    )
                ],
            }

            hist_rows = conn.execute(
                """
                SELECT data, score_composto FROM scores_historico
                WHERE aba_id = ? ORDER BY data DESC LIMIT 120
                """,
                (aba_id,),
            ).fetchall()
            snapshot["classes"][class_id]["scoreHistory"] = [
                {"date": r["data"], "score": float(r["score_composto"])}
                for r in reversed(hist_rows)
            ]

            if regime_model:
                snapshot["classes"][class_id]["regimeModel"] = regime_model
                regime_inds = [
                    _indicator_export(c)
                    for c in (regime_model.get("components") or [])
                    if isinstance(c, dict) and c.get("id")
                ]
                if regime_inds:
                    cls_entry = snapshot["classes"][class_id]
                    cls_entry["allIndicators"] = _merge_indicator_exports(
                        cls_entry.get("allIndicators", []),
                        regime_inds,
                    )
                    cls_entry["indicators"] = cls_entry["allIndicators"][:5]

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
        class_actions: dict[str, str | None] = {}
        for cls in snapshot["classes"].values():
            class_scores[cls["classId"]] = cls.get("allocationScore", cls["score"])
            class_stages[cls["classId"]] = cls.get("stage") or "Maduro"
            class_actions[cls["classId"]] = (
                regime_models.get(cls["classId"], {}).get("action")
                or cls.get("allocationAction")
            )

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
                aba_id=row["aba_id"],
                regime_action=class_actions.get(class_id),
            )
            tick_payload = enrich_ticker_performance(
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
                "scoreDomain": validation["scoreDomain"],
                "allocationAction": validation["allocationAction"],
                "instrumentQuality": validation["instrumentQuality"],
                "entryTiming": validation["entryTiming"],
                "entryReasons": validation["entryReasons"],
                "peerMedian": validation["peerMedian"],
                "rationale": validation["rationale"],
                "dominantIndicator": validation["dominantIndicator"],
                "indicators": [_indicator_export(c) for c in top_inds],
                "allIndicators": [
                    _indicator_export(c)
                    for c in sorted(
                        componentes,
                        key=lambda c: abs(c.get("contribuicao", 0)),
                        reverse=True,
                    )
                ],
            },
            )
            tick_hist = conn.execute(
                """
                SELECT data, score_composto FROM scores_ativo
                WHERE aba_id = ? AND ticker = ?
                ORDER BY data DESC LIMIT 120
                """,
                (row["aba_id"], ticker),
            ).fetchall()
            tick_payload["scoreHistory"] = [
                {"date": r["data"], "score": float(r["score_composto"])}
                for r in reversed(tick_hist)
            ]
            snapshot["tickers"][ticker] = tick_payload

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

    try:
        from motor.src.calculo.models import build_models_snapshot

        snapshot["models"] = build_models_snapshot()
    except Exception as e:
        print(f"[export_dashboard] WARN: models block failed: {e}", file=sys.stderr)

    decision_path = MOTOR_ROOT / "config" / "class_decision_map.json"
    if decision_path.is_file():
        snapshot["decisionMap"] = json.loads(decision_path.read_text(encoding="utf-8"))

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
