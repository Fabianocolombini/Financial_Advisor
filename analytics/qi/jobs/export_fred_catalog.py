"""Gera relatório Markdown do catálogo FRED ingerido (`qi_macro_series` / `qi_macro_series_point`)."""

from __future__ import annotations

import argparse
import datetime as dt
import os
import sys
from pathlib import Path

from sqlalchemy import exists, func, select

from qi.db.models import QiMacroSeries, QiMacroSeriesPoint
from qi.db.session import get_session


def _md_escape(s: str | None) -> str:
    if not s:
        return ""
    return s.replace("|", "\\|").replace("\n", " ")


def run_export(max_rows: int | None) -> str:
    lines: list[str] = []
    now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines.append("# Catálogo FRED ingerido")
    lines.append("")
    lines.append(f"*Gerado em {now}*")
    lines.append("")

    with get_session() as session:
        total_series = session.scalar(
            select(func.count()).select_from(QiMacroSeries).where(QiMacroSeries.provider == "FRED")
        )
        total_series = int(total_series or 0)

        total_points = session.scalar(
            select(func.count())
            .select_from(QiMacroSeriesPoint)
            .join(QiMacroSeries, QiMacroSeriesPoint.series_id == QiMacroSeries.id)
            .where(QiMacroSeries.provider == "FRED")
        )
        total_points = int(total_points or 0)

        dmin = session.scalar(
            select(func.min(QiMacroSeriesPoint.observed_on))
            .select_from(QiMacroSeriesPoint)
            .join(QiMacroSeries, QiMacroSeriesPoint.series_id == QiMacroSeries.id)
            .where(QiMacroSeries.provider == "FRED")
        )
        dmax = session.scalar(
            select(func.max(QiMacroSeriesPoint.observed_on))
            .select_from(QiMacroSeriesPoint)
            .join(QiMacroSeries, QiMacroSeriesPoint.series_id == QiMacroSeries.id)
            .where(QiMacroSeries.provider == "FRED")
        )

        with_pts = session.scalar(
            select(func.count())
            .select_from(QiMacroSeries)
            .where(QiMacroSeries.provider == "FRED")
            .where(exists().where(QiMacroSeriesPoint.series_id == QiMacroSeries.id))
        )
        with_pts = int(with_pts or 0)

        lines.append("## Resumo")
        lines.append("")
        lines.append("| Métrica | Valor |")
        lines.append("|--------|-------|")
        lines.append(f"| Séries FRED (`qi_macro_series`) | {total_series} |")
        lines.append(f"| Séries com ≥1 ponto | {with_pts} |")
        lines.append(f"| Pontos totais (`qi_macro_series_point`) | {total_points} |")
        dm = dmin.isoformat() if dmin else "—"
        dx = dmax.isoformat() if dmax else "—"
        lines.append(f"| Primeira data observada | {dm} |")
        lines.append(f"| Última data observada | {dx} |")
        lines.append("")

        stmt = (
            select(
                QiMacroSeries.external_id,
                QiMacroSeries.title,
                func.count(QiMacroSeriesPoint.id).label("n_pts"),
                func.min(QiMacroSeriesPoint.observed_on).label("d_min"),
                func.max(QiMacroSeriesPoint.observed_on).label("d_max"),
                QiMacroSeries.last_successful_run_at,
            )
            .outerjoin(QiMacroSeriesPoint, QiMacroSeriesPoint.series_id == QiMacroSeries.id)
            .where(QiMacroSeries.provider == "FRED")
            .group_by(QiMacroSeries.id)
            .order_by(QiMacroSeries.external_id)
        )
        rows = session.execute(stmt).all()

        listed = rows if max_rows is None else rows[:max_rows]
        omitted = 0 if max_rows is None else max(0, len(rows) - len(listed))

        lines.append("## Séries")
        lines.append("")
        lines.append(
            "| `external_id` | Título | Pontos | Min data | Max data | Última ingestão |"
        )
        lines.append("|---------------|--------|--------|----------|----------|-----------------|")

        for r in listed:
            ext, title, n_pts, d_lo, d_hi, last_run = r
            n_pts = int(n_pts or 0)
            t = _md_escape(title)
            dlo = d_lo.isoformat() if d_lo else "—"
            dhi = d_hi.isoformat() if d_hi else "—"
            lr = last_run.strftime("%Y-%m-%d %H:%M") if last_run else "—"
            lines.append(f"| `{ext}` | {t} | {n_pts} | {dlo} | {dhi} | {lr} |")

        if omitted:
            lines.append("")
            lines.append(
                f"*Listagem truncada: {omitted} séries omitidas "
                f"(aumente o limite ou defina `QI_FRED_EXPORT_MAX_ROWS`).*"
            )

        lines.append("")
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description="Exporta relatório Markdown do catálogo FRED ingerido.")
    parser.add_argument(
        "-o",
        "--out",
        type=Path,
        help="Ficheiro de saída (default: stdout)",
    )
    args = parser.parse_args()

    raw = os.environ.get("QI_FRED_EXPORT_MAX_ROWS", "").strip()
    max_rows: int | None = int(raw) if raw.isdigit() else None

    text = run_export(max_rows)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text, encoding="utf-8")
        print(f"Escrito {args.out}", file=sys.stderr)
    else:
        sys.stdout.write(text)


if __name__ == "__main__":
    main()
