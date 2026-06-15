from __future__ import annotations

import time
from collections import Counter
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib
import pandas as pd

from backend.src.feature_engine.features import CATEGORICAL_FEATURES, NUMERIC_FEATURES


BACKEND_ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = BACKEND_ROOT / "saved_models"

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


def _load_threshold(path: Path) -> float:
    threshold_obj = joblib.load(path)
    if isinstance(threshold_obj, dict):
        return float(threshold_obj["threshold"])
    return float(threshold_obj)


@lru_cache(maxsize=1)
def load_model_artifacts() -> ModelArtifacts:
    paths = {
        "feature_pipeline": MODEL_DIR / "feature_pipeline.joblib",
        "anomaly_detector": MODEL_DIR / "anomaly_detector.joblib",
        "anomaly_threshold": MODEL_DIR / "anomaly_threshold.joblib",
        "fault_classifier": MODEL_DIR / "fault_classifier.joblib",
    }
    missing = [name for name, path in paths.items() if not path.exists()]
    if missing:
        raise FileNotFoundError(f"missing model artifacts: {', '.join(missing)}")

    return ModelArtifacts(
        feature_pipeline=joblib.load(paths["feature_pipeline"]),
        anomaly_detector=joblib.load(paths["anomaly_detector"]),
        anomaly_threshold=_load_threshold(paths["anomaly_threshold"]),
        fault_classifier=joblib.load(paths["fault_classifier"]),
    )


def model_paths() -> dict[str, str]:
    return {
        "feature_pipeline_path": str(MODEL_DIR / "feature_pipeline.joblib"),
        "anomaly_detector_path": str(MODEL_DIR / "anomaly_detector.joblib"),
        "anomaly_threshold_path": str(MODEL_DIR / "anomaly_threshold.joblib"),
        "fault_classifier_path": str(MODEL_DIR / "fault_classifier.joblib"),
    }


def _model_available(*artifact_names: str) -> bool:
    paths = {
        "feature_pipeline": MODEL_DIR / "feature_pipeline.joblib",
        "anomaly_detector": MODEL_DIR / "anomaly_detector.joblib",
        "anomaly_threshold": MODEL_DIR / "anomaly_threshold.joblib",
        "fault_classifier": MODEL_DIR / "fault_classifier.joblib",
    }
    return all(paths[name].exists() for name in artifact_names)


def anomaly_model_available() -> bool:
    return _model_available("feature_pipeline", "anomaly_detector", "anomaly_threshold")


def classifier_model_available() -> bool:
    return _model_available("feature_pipeline", "fault_classifier")


def _as_frame(records: list[dict[str, Any]]) -> pd.DataFrame:
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


def _json_number(value: Any) -> float | int | None:
    if value is None or pd.isna(value):
        return None
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    return float(value)


def _key_metrics(record: dict[str, Any]) -> dict[str, float | int | None]:
    return {metric: _json_number(record.get(metric)) for metric in DISPLAY_METRICS if metric in record}


def _record_identity(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "metric_id": record.get("metric_id"),
        "source_dataset": record.get("source_dataset"),
        "scenario_id": record.get("scenario_id"),
        "timestamp": record.get("timestamp"),
        "station_id": record.get("station_id"),
        "actual_is_fault": _json_number(record.get("is_fault")),
        "actual_fault_type": record.get("fault_type_cn"),
    }


def detect_anomalies(records: list[dict[str, Any]]) -> dict[str, Any]:
    started = time.perf_counter()
    artifacts = load_model_artifacts()
    frame = _as_frame(records)
    transformed = artifacts.feature_pipeline.transform(frame)
    scores = -artifacts.anomaly_detector.decision_function(transformed)
    predictions = (scores >= artifacts.anomaly_threshold).astype(int)
    elapsed_ms = (time.perf_counter() - started) * 1000

    results = []
    labeled_total = 0
    labeled_correct = 0
    for record, score, prediction in zip(records, scores, predictions):
        actual_is_fault = record.get("is_fault")
        if actual_is_fault is not None:
            labeled_total += 1
            labeled_correct += int(int(actual_is_fault) == int(prediction))
        results.append(
            {
                **_record_identity(record),
                "is_anomaly": bool(prediction),
                "anomaly_score": float(score),
                "threshold": artifacts.anomaly_threshold,
                "key_metrics": _key_metrics(record),
            }
        )

    return {
        "model_available": anomaly_model_available(),
        **model_paths(),
        "sample_count": len(records),
        "anomaly_count": int(predictions.sum()),
        "threshold": artifacts.anomaly_threshold,
        "latency_ms": float(elapsed_ms),
        "labeled_accuracy": (labeled_correct / labeled_total) if labeled_total else None,
        "results": results,
    }


def classify_faults(records: list[dict[str, Any]]) -> dict[str, Any]:
    started = time.perf_counter()
    artifacts = load_model_artifacts()
    frame = _as_frame(records)
    transformed = artifacts.feature_pipeline.transform(frame)
    predictions = artifacts.fault_classifier.predict(transformed)
    probabilities = artifacts.fault_classifier.predict_proba(transformed)
    classes = [str(label) for label in artifacts.fault_classifier.classes_]
    elapsed_ms = (time.perf_counter() - started) * 1000

    results = []
    labeled_total = 0
    labeled_correct = 0
    for record, prediction, probability in zip(records, predictions, probabilities):
        predicted_fault_type = str(prediction)
        actual_fault_type = record.get("fault_type_cn")
        if actual_fault_type:
            labeled_total += 1
            labeled_correct += int(str(actual_fault_type) == predicted_fault_type)
        class_probabilities = {
            label: float(probability[index])
            for index, label in enumerate(classes)
        }
        results.append(
            {
                **_record_identity(record),
                "predicted_fault_type": predicted_fault_type,
                "confidence": max(class_probabilities.values()) if class_probabilities else None,
                "probabilities": class_probabilities,
                "key_metrics": _key_metrics(record),
            }
        )

    predicted_counts = Counter(str(label) for label in predictions)
    return {
        "model_available": classifier_model_available(),
        **model_paths(),
        "sample_count": len(records),
        "latency_ms": float(elapsed_ms),
        "labeled_accuracy": (labeled_correct / labeled_total) if labeled_total else None,
        "predicted_type_counts": dict(predicted_counts),
        "results": results,
    }
