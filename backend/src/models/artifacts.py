"""模型工件加载与推理输入预处理（异常检测与故障分类共享）。"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib
import pandas as pd

from backend.src.feature_engine.features import (
    CATEGORICAL_FEATURES,
    NUMERIC_FEATURES,
    add_anomaly_features,
)
from backend.src.utils.config import MODEL_FILENAMES, SAVED_MODELS_DIR, model_path


DISPLAY_METRICS = [
    "rsrp",
    "sinr",
    "ber",
    "bler_dl",
    "bler_ul",
    "bandwidth_usage",
    "rb_num",
    "throughput_mbps",
    "traffic_bytes",
    "packet_count",
    "mcs",
]


@dataclass(frozen=True)
class ModelArtifacts:
    feature_pipeline: Any
    anomaly_detector: Any
    anomaly_threshold: float
    fault_classifier: Any
    anomaly_feature_pipeline: Any
    anomaly_supervised: Any
    anomaly_fusion: dict


def _load_threshold(path: Path) -> float:
    threshold_obj = joblib.load(path)
    if isinstance(threshold_obj, dict):
        return float(threshold_obj["threshold"])
    return float(threshold_obj)


@lru_cache(maxsize=1)
def load_model_artifacts() -> ModelArtifacts:
    paths = {name: model_path(name) for name in MODEL_FILENAMES}
    missing = [name for name, path in paths.items() if not path.exists()]
    if missing:
        raise FileNotFoundError(f"missing model artifacts: {', '.join(missing)}")

    return ModelArtifacts(
        feature_pipeline=joblib.load(paths["feature_pipeline"]),
        anomaly_detector=joblib.load(paths["anomaly_detector"]),
        anomaly_threshold=_load_threshold(paths["anomaly_threshold"]),
        fault_classifier=joblib.load(paths["fault_classifier"]),
        anomaly_feature_pipeline=joblib.load(paths["anomaly_feature_pipeline"]),
        anomaly_supervised=joblib.load(paths["anomaly_supervised"]),
        anomaly_fusion=joblib.load(paths["anomaly_fusion"]),
    )


def model_paths() -> dict[str, str]:
    return {
        "feature_pipeline_path": str(model_path("feature_pipeline")),
        "anomaly_detector_path": str(model_path("anomaly_detector")),
        "anomaly_threshold_path": str(model_path("anomaly_threshold")),
        "fault_classifier_path": str(model_path("fault_classifier")),
    }


def _model_available(*artifact_names: str) -> bool:
    return all(model_path(name).exists() for name in artifact_names)


def anomaly_model_available() -> bool:
    return _model_available(
        "anomaly_feature_pipeline",
        "anomaly_supervised",
        "anomaly_detector",
        "anomaly_fusion",
        "anomaly_threshold",
    )


def classifier_model_available() -> bool:
    return _model_available("feature_pipeline", "fault_classifier")


def as_frame(records: list[dict[str, Any]]) -> pd.DataFrame:
    """将推理输入记录整理为分类特征管线可消费的 DataFrame。"""

    frame = pd.DataFrame(records)
    for column in NUMERIC_FEATURES:
        if column not in frame:
            frame[column] = None
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    for column in CATEGORICAL_FEATURES:
        if column not in frame:
            frame[column] = ""
        frame[column] = frame[column].fillna("").astype(str)
    return frame


def as_anomaly_frame(records: list[dict[str, Any]]) -> pd.DataFrame:
    """将推理输入记录整理为异常检测特征（数值 KPI + 派生）的 DataFrame。"""

    frame = pd.DataFrame(records)
    for column in NUMERIC_FEATURES:
        if column not in frame:
            frame[column] = None
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    return add_anomaly_features(frame)


def json_number(value: Any) -> float | int | None:
    if value is None or pd.isna(value):
        return None
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    return float(value)


def key_metrics(record: dict[str, Any]) -> dict[str, float | int | None]:
    return {metric: json_number(record.get(metric)) for metric in DISPLAY_METRICS if metric in record}


def record_identity(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "metric_id": record.get("metric_id"),
        "source_dataset": record.get("source_dataset"),
        "scenario_id": record.get("scenario_id"),
        "timestamp": record.get("timestamp"),
        "station_id": record.get("station_id"),
        "actual_is_fault": json_number(record.get("is_fault")),
        "actual_fault_type": record.get("fault_type_cn"),
    }


# 兼容旧引用
MODEL_DIR = SAVED_MODELS_DIR
