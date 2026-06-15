from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import joblib
import matplotlib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split

from backend.src.feature_engine.features import (
    TARGET_ANOMALY,
    TARGET_FAULT,
    build_feature_pipeline,
    load_network_metrics,
    select_telecom_model_frame,
)


matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402


RANDOM_SEED = 42


def metrics_binary(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "f1": float(f1_score(y_true, y_pred, zero_division=0)),
    }


def metrics_multiclass(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, object]:
    labels = sorted(set(y_true) | set(y_pred))
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision_macro": float(precision_score(y_true, y_pred, average="macro", zero_division=0)),
        "recall_macro": float(recall_score(y_true, y_pred, average="macro", zero_division=0)),
        "f1_macro": float(f1_score(y_true, y_pred, average="macro", zero_division=0)),
        "labels": labels,
        "confusion_matrix": confusion_matrix(y_true, y_pred, labels=labels).tolist(),
    }


def select_threshold(scores: np.ndarray, y_true: np.ndarray) -> float:
    best_threshold = float(np.quantile(scores, 0.5))
    best_score = -1.0
    for threshold in np.quantile(scores, np.linspace(0.05, 0.95, 91)):
        prediction = (scores >= threshold).astype(int)
        score = f1_score(y_true, prediction, zero_division=0)
        if score > best_score:
            best_score = score
            best_threshold = float(threshold)
    return best_threshold


def split_frame(frame: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    train_frame, holdout_frame = train_test_split(
        frame,
        test_size=0.3,
        random_state=RANDOM_SEED,
        stratify=frame[TARGET_FAULT],
    )
    validation_frame, test_frame = train_test_split(
        holdout_frame,
        test_size=0.5,
        random_state=RANDOM_SEED,
        stratify=holdout_frame[TARGET_FAULT],
    )
    return train_frame, validation_frame, test_frame


def average_localization_error(processed_dir: Path) -> float | None:
    path = processed_dir / "fault_samples.csv"
    frame = pd.read_csv(path, encoding="utf-8-sig", low_memory=False)
    errors = pd.to_numeric(frame["localization_error_m"], errors="coerce").dropna()
    if errors.empty:
        return None
    return float(errors.mean())


def plot_confusion_matrix(labels: list[str], matrix: list[list[int]], output_path: Path) -> None:
    fig, ax = plt.subplots(figsize=(8, 6))
    image = ax.imshow(matrix, cmap="Blues")
    ax.set_xticks(range(len(labels)))
    ax.set_yticks(range(len(labels)))
    ax.set_xticklabels(labels, rotation=35, ha="right", fontproperties="SimHei")
    ax.set_yticklabels(labels, fontproperties="SimHei")
    ax.set_xlabel("预测类别", fontproperties="SimHei")
    ax.set_ylabel("真实类别", fontproperties="SimHei")
    ax.set_title("故障分类混淆矩阵", fontproperties="SimHei")
    for i, row in enumerate(matrix):
        for j, value in enumerate(row):
            ax.text(j, i, str(value), ha="center", va="center", fontsize=8)
    fig.colorbar(image, ax=ax, fraction=0.046, pad=0.04)
    fig.tight_layout()
    fig.savefig(output_path, dpi=160)
    plt.close(fig)


def plot_localization_errors(processed_dir: Path, output_path: Path) -> None:
    frame = pd.read_csv(processed_dir / "fault_samples.csv", encoding="utf-8-sig", low_memory=False)
    errors = pd.to_numeric(frame["localization_error_m"], errors="coerce").dropna()
    fig, ax = plt.subplots(figsize=(8, 5))
    ax.hist(errors, bins=30, color="#2f6f9f", edgecolor="white")
    ax.set_xlabel("定位误差 / m", fontproperties="SimHei")
    ax.set_ylabel("样本数", fontproperties="SimHei")
    ax.set_title("Kaggle 补充定位误差分布", fontproperties="SimHei")
    fig.tight_layout()
    fig.savefig(output_path, dpi=160)
    plt.close(fig)


def train_models(processed_dir: Path, model_dir: Path, reports_dir: Path, sample_size: int | None) -> dict[str, object]:
    started = time.perf_counter()
    frame = select_telecom_model_frame(load_network_metrics(processed_dir))
    if sample_size and len(frame) > sample_size:
        frame = frame.sample(n=sample_size, random_state=RANDOM_SEED).reset_index(drop=True)

    train_frame, validation_frame, test_frame = split_frame(frame)
    pipeline = build_feature_pipeline()
    x_train = pipeline.fit_transform(train_frame)
    x_validation = pipeline.transform(validation_frame)
    x_test = pipeline.transform(test_frame)

    normal_train = x_train[train_frame[TARGET_ANOMALY].to_numpy() == 0]
    anomaly_detector = IsolationForest(
        n_estimators=160,
        contamination=0.1,
        random_state=RANDOM_SEED,
        n_jobs=-1,
    )
    anomaly_detector.fit(normal_train)
    validation_scores = -anomaly_detector.decision_function(x_validation)
    threshold = select_threshold(validation_scores, validation_frame[TARGET_ANOMALY].to_numpy())
    anomaly_scores = -anomaly_detector.decision_function(x_test)
    anomaly_prediction = (anomaly_scores >= threshold).astype(int)

    classifier = RandomForestClassifier(
        n_estimators=220,
        random_state=RANDOM_SEED,
        n_jobs=-1,
        class_weight="balanced_subsample",
        min_samples_leaf=2,
    )
    classifier.fit(x_train, train_frame[TARGET_FAULT])
    fault_prediction = classifier.predict(x_test)

    elapsed_ms = (time.perf_counter() - started) * 1000
    classification = metrics_multiclass(test_frame[TARGET_FAULT].to_numpy(), fault_prediction)
    evaluation = {
        "dataset_scope": "TelecomTS for anomaly detection and fault classification; Kaggle for localization summary",
        "dataset_rows_used": int(len(frame)),
        "train_rows": int(len(train_frame)),
        "validation_rows": int(len(validation_frame)),
        "test_rows": int(len(test_frame)),
        "random_seed": RANDOM_SEED,
        "anomaly_threshold": float(threshold),
        "detection_latency_ms": float(elapsed_ms),
        "anomaly_detection": metrics_binary(test_frame[TARGET_ANOMALY].to_numpy(), anomaly_prediction),
        "fault_classification": classification,
        "average_localization_error_m": average_localization_error(processed_dir),
    }

    model_dir.mkdir(parents=True, exist_ok=True)
    reports_dir.mkdir(parents=True, exist_ok=True)
    figures_dir = reports_dir / "figures"
    figures_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, model_dir / "feature_pipeline.joblib")
    joblib.dump(anomaly_detector, model_dir / "anomaly_detector.joblib")
    joblib.dump({"threshold": threshold}, model_dir / "anomaly_threshold.joblib")
    joblib.dump(classifier, model_dir / "fault_classifier.joblib")
    (reports_dir / "model_evaluation.json").write_text(
        json.dumps(evaluation, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    plot_confusion_matrix(
        classification["labels"],
        classification["confusion_matrix"],
        figures_dir / "confusion_matrix.png",
    )
    plot_localization_errors(processed_dir, figures_dir / "localization_error_distribution.png")
    return evaluation


def parse_args() -> argparse.Namespace:
    backend_root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description="Train phase-2 anomaly and fault classification models.")
    parser.add_argument("--processed-dir", type=Path, default=backend_root / "data" / "processed")
    parser.add_argument("--model-dir", type=Path, default=backend_root / "saved_models")
    parser.add_argument("--reports-dir", type=Path, default=backend_root / "reports")
    parser.add_argument("--sample-size", type=int, default=80000)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    sample_size = args.sample_size if args.sample_size and args.sample_size > 0 else None
    result = train_models(args.processed_dir, args.model_dir, args.reports_dir, sample_size)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
