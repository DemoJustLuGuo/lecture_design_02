from __future__ import annotations

import json
from pathlib import Path

import joblib


BACKEND_DIR = Path(__file__).resolve().parents[1]
MODEL_DIR = BACKEND_DIR / "saved_models"
REPORTS_DIR = BACKEND_DIR / "reports"


def test_phase2_model_artifacts_exist() -> None:
    expected = {
        "feature_pipeline.joblib",
        "anomaly_detector.joblib",
        "anomaly_threshold.joblib",
        "fault_classifier.joblib",
    }
    assert expected.issubset({path.name for path in MODEL_DIR.iterdir()})


def test_phase2_evaluation_report_has_required_metrics() -> None:
    report = json.loads((REPORTS_DIR / "model_evaluation.json").read_text(encoding="utf-8"))

    assert report["dataset_rows_used"] >= 3000
    assert report["random_seed"] == 42
    assert report["anomaly_detection"]["f1"] > 0
    assert report["fault_classification"]["accuracy"] > 0
    assert report["average_localization_error_m"] is not None


def test_fault_classifier_uses_telecom_main_labels_only() -> None:
    report = json.loads((REPORTS_DIR / "model_evaluation.json").read_text(encoding="utf-8"))
    labels = set(report["fault_classification"]["labels"])

    assert "信号中断/覆盖退化" not in labels
    assert {"信道干扰", "基站故障", "带宽不足", "正常", "误码过高"}.issubset(labels)


def test_saved_threshold_and_figures_are_available() -> None:
    threshold = joblib.load(MODEL_DIR / "anomaly_threshold.joblib")
    figures = {
        "confusion_matrix.png",
        "localization_error_distribution.png",
    }

    assert isinstance(threshold["threshold"], float)
    assert figures.issubset({path.name for path in (REPORTS_DIR / "figures").iterdir()})
    for figure in figures:
        assert (REPORTS_DIR / "figures" / figure).stat().st_size > 0
