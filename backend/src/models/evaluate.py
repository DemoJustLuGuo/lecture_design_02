"""模型评估编排。

汇总异常检测与故障分类指标、定位误差，产出可写入报告的评估字典。
通用指标计算复用 ``utils.metrics``。
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from backend.src.utils.metrics import binary_metrics, multiclass_metrics


def average_localization_error(processed_dir: Path) -> float | None:
    """从 fault_samples.csv 统计平均定位误差（米）。保留向后兼容的标量接口。"""

    errors = _localization_error_series(processed_dir)
    if errors.empty:
        return None
    return float(errors.mean())


def localization_errors(processed_dir: Path) -> list[float]:
    """读取定位误差序列，供误差分布图使用。"""

    return _localization_error_series(processed_dir).tolist()


def _localization_error_series(processed_dir: Path) -> pd.Series:
    path = processed_dir / "fault_samples.csv"
    frame = pd.read_csv(path, encoding="utf-8-sig", low_memory=False)
    return pd.to_numeric(frame["localization_error_m"], errors="coerce").dropna()


def localization_error_stats(processed_dir: Path, track: str = "public_proxy") -> dict[str, object] | None:
    """定位误差统计：均值/中位数/P90/样本数。

    ``track`` 标注该口径来源：
    - ``public_proxy``：公开/Kaggle 路测点与参考工参点的代理误差；
    - ``synthetic_algorithm``：合成场景下定位算法输出 vs 已知真值（课程主指标）。
    """

    errors = _localization_error_series(processed_dir)
    if errors.empty:
        return None
    return {
        "track": track,
        "count": int(errors.size),
        "mean_m": float(errors.mean()),
        "median_m": float(errors.median()),
        "p90_m": float(errors.quantile(0.9)),
        "max_m": float(errors.max()),
    }


def assemble_evaluation(
    *,
    dataset_rows_used: int,
    train_rows: int,
    validation_rows: int,
    test_rows: int,
    random_seed: int,
    split_strategy: str,
    anomaly_threshold: float,
    training_time_ms: float,
    detection_latency_ms: float,
    detection_latency_ms_per_sample: float,
    anomaly_true: np.ndarray,
    anomaly_pred: np.ndarray,
    fault_true: np.ndarray,
    fault_pred: np.ndarray,
    fault_labels: list[str],
    average_localization_error_m: float | None,
    localization: dict[str, object] | None = None,
    classification_cv: dict[str, object] | None = None,
    in_distribution_reference: dict[str, object] | None = None,
    classification_review: dict[str, object] | None = None,
) -> dict[str, object]:
    """组合完整评估报告。"""

    return {
        "dataset_scope": "TelecomTS for anomaly detection and fault classification; Kaggle for localization summary",
        "dataset_rows_used": int(dataset_rows_used),
        "train_rows": int(train_rows),
        "validation_rows": int(validation_rows),
        "test_rows": int(test_rows),
        "random_seed": random_seed,
        "split_strategy": split_strategy,
        "anomaly_threshold": float(anomaly_threshold),
        "training_time_ms": float(training_time_ms),
        "detection_latency_ms": float(detection_latency_ms),
        "detection_latency_ms_per_sample": float(detection_latency_ms_per_sample),
        "anomaly_detection": binary_metrics(anomaly_true, anomaly_pred),
        "fault_classification": multiclass_metrics(fault_true, fault_pred, labels=fault_labels),
        "fault_classification_cv": classification_cv,
        "classification_review": classification_review,
        "in_distribution_reference": in_distribution_reference,
        "average_localization_error_m": average_localization_error_m,
        "localization": localization,
    }
