"""Regime risk probability — logistic overlay with optional historical calibration."""

from __future__ import annotations

import datetime as dt
import json
import math
from typing import Any

import numpy as np
import pandas as pd

from motor.src.calculo.derivados import get_fred_series
from motor.src.paths import CONFIG_DIR

_CONFIG = CONFIG_DIR / "models" / "regime_logit.json"
_MIN_SAMPLES = 120
_FEATURE_SPECS = [
    {"id": "t10y2y", "serie": "T10Y2Y"},
    {"id": "vix", "serie": "VIXCLS"},
    {"id": "hy_oas", "serie": "BAMLH0A0HYM2"},
    {"id": "eurusd", "serie": "DEXUSEU"},
]


def _load_config() -> dict[str, Any]:
    if not _CONFIG.is_file():
        return {
            "intercept": -2.0,
            "features": [],
            "calibrated": False,
            "note": "Config ausente — usando defaults não calibrados.",
        }
    return json.loads(_CONFIG.read_text(encoding="utf-8"))


def _save_config(cfg: dict[str, Any]) -> None:
    _CONFIG.parent.mkdir(parents=True, exist_ok=True)
    _CONFIG.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")


def _build_training_frame() -> pd.DataFrame | None:
    series_map: dict[str, pd.Series] = {}
    for spec in _FEATURE_SPECS:
        s = get_fred_series(spec["serie"])
        if s.empty:
            return None
        series_map[spec["id"]] = s
    df = pd.concat(series_map, axis=1, join="inner").dropna()
    if len(df) < _MIN_SAMPLES:
        return None
    # Label: stress contemporâneo (não previsão de retorno — fit descritivo simples)
    vix_thr = float(df["vix"].quantile(0.75))
    hy_thr = float(df["hy_oas"].quantile(0.75))
    df["y"] = (
        (df["t10y2y"] < 0)
        | (df["vix"] > vix_thr)
        | (df["hy_oas"] > hy_thr)
    ).astype(float)
    if df["y"].nunique() < 2:
        return None
    return df


def _fit_logistic(df: pd.DataFrame) -> tuple[float, np.ndarray] | None:
    feature_cols = [spec["id"] for spec in _FEATURE_SPECS]
    X_raw = df[feature_cols].values.astype(float)
    y = df["y"].values.astype(float)
    mean = X_raw.mean(axis=0)
    std = X_raw.std(axis=0)
    std[std == 0] = 1.0
    X = (X_raw - mean) / std
    n, d = X.shape
    w = np.zeros(d)
    b = 0.0
    lr = 0.05
    for _ in range(800):
        z = X @ w + b
        p = 1.0 / (1.0 + np.exp(-np.clip(z, -30, 30)))
        grad_w = (X.T @ (p - y)) / n + 0.01 * w
        grad_b = float(np.mean(p - y))
        w -= lr * grad_w
        b -= lr * grad_b
    # Coefs em escala original: z = b + sum(w_i * (x_i - mean_i) / std_i)
    coefs_raw = w / std
    intercept = b - float(np.sum(w * mean / std))
    return intercept, coefs_raw


def calibrate_regime_logit(persist: bool = True) -> dict[str, Any]:
    """Fit logistic on ingested FRED history; persist coefficients when possible."""
    df = _build_training_frame()
    if df is None:
        return {"ok": False, "calibrated": False, "error": "insufficient_history"}
    fit = _fit_logistic(df)
    if fit is None:
        return {"ok": False, "calibrated": False, "error": "fit_failed"}
    intercept, coefs = fit
    features_out = []
    for i, spec in enumerate(_FEATURE_SPECS):
        features_out.append(
            {
                "id": spec["id"],
                "serie": spec["serie"],
                "coefficient": float(coefs[i]),
            }
        )
    cfg = {
        "intercept": float(intercept),
        "features": features_out,
        "calibrated": True,
        "calibrated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "n_samples": int(len(df)),
        "label_note": (
            "y=1 se curva invertida, VIX>75p ou HY OAS>75p (contemporâneo, não forecast de retorno)"
        ),
        "note": "Coeficientes ajustados por regressão logística sobre histórico FRED no SQLite.",
    }
    if persist:
        _save_config(cfg)
    return {"ok": True, **cfg}


def compute_regime_risk(auto_calibrate: bool = True) -> dict[str, Any]:
    cfg = _load_config()
    if auto_calibrate and not cfg.get("calibrated"):
        cal = calibrate_regime_logit(persist=True)
        if cal.get("ok"):
            cfg = _load_config()

    calibrated = bool(cfg.get("calibrated"))
    features_out: list[dict[str, Any]] = []
    z = float(cfg.get("intercept", 0))
    for feat in cfg.get("features", []):
        serie = feat.get("serie", "")
        s = get_fred_series(serie)
        val = float(s.iloc[-1]) if not s.empty else 0.0
        coeff = float(feat.get("coefficient", 0))
        z += coeff * val
        features_out.append(
            {
                "id": feat.get("id", serie),
                "value": val,
                "coefficient": coeff,
            }
        )
    prob = 1.0 / (1.0 + math.exp(-z))
    out: dict[str, Any] = {
        "regime_risk_probability": prob,
        "logit_z": z,
        "features": features_out,
        "calibrated": calibrated,
        "note": cfg.get("note", ""),
    }
    if not calibrated:
        out["calibration_warning"] = (
            "Probabilidade não calibrada contra histórico — não tratar como forecast validado."
        )
    if cfg.get("calibrated_at"):
        out["calibrated_at"] = cfg["calibrated_at"]
    if cfg.get("n_samples"):
        out["n_samples"] = cfg["n_samples"]
    if cfg.get("label_note"):
        out["label_note"] = cfg["label_note"]
    return out
