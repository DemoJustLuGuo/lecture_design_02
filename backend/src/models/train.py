"""一键训练并保存异常检测与故障分类模型。

编排：加载数据 -> 按 scenario 分组切分 -> 特征工程 -> 训练异常检测/故障分类 ->
评估（含分组交叉验证与真实推理耗时）-> 保存模型工件 -> 生成报告图表。可独立运行：

    python -m backend.src.models.train

切分策略说明：通信指标按 ``scenario_id`` 成段产生，随机按行切分会让同一场景同时
落入训练集与测试集，导致指标偏乐观。这里改用 ``StratifiedGroupKFold`` 按 scenario
分组且兼顾类别分布，使训练/验证/测试不共享场景。
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from sklearn.model_selection import StratifiedGroupKFold, train_test_split

from backend.src.feature_engine.features import (
    TARGET_ANOMALY,
    TARGET_FAULT,
    add_anomaly_features,
    build_anomaly_feature_pipeline,
    build_feature_pipeline,
    load_network_metrics,
    select_telecom_model_frame,
)
from backend.src.models.anomaly_detector import (
    _supervised_fault_proba,
    build_anomaly_detector,
    build_supervised_detector,
    fuse_scores,
    normalize_if_scores,
    rule_anomaly_score,
)
from backend.src.models.evaluate import (
    assemble_evaluation,
    average_localization_error,
    localization_error_stats,
    localization_errors,
)
from backend.src.models.fault_classifier import LOW_CONFIDENCE_THRESHOLD, build_fault_classifier
from backend.src.models.localization_benchmark import run_synthetic_localization_benchmark
from backend.src.utils.config import PROCESSED_DIR, REPORTS_DIR, SAVED_MODELS_DIR
from backend.src.utils.metrics import select_anomaly_threshold
from backend.src.visualization.charts import (
    plot_confusion_matrix,
    plot_localization_error_distribution,
)


RANDOM_SEED = 42
GROUP_COL = "scenario_id"
SPLIT_STRATEGY = "StratifiedGroupKFold(scenario_id)"
CV_SPLITS = 3
CV_SAMPLE_SIZE = 40000
# 异常检测融合权重网格 (supervised, rule, isolation_forest)，和为 1
ANOMALY_WEIGHT_GRID = [
    (sup, rule, round(1.0 - sup - rule, 4))
    for sup in (0.4, 0.5, 0.6, 0.7, 0.8)
    for rule in (0.0, 0.1, 0.2, 0.3)
    if 1.0 - sup - rule >= -1e-9
]


def _grouped_holdout(
    frame: pd.DataFrame,
    n_splits: int,
) -> tuple[np.ndarray, np.ndarray]:
    """取 StratifiedGroupKFold 的第一折作为 (大集索引, 留出集索引)。"""

    splitter = StratifiedGroupKFold(n_splits=n_splits, shuffle=True, random_state=RANDOM_SEED)
    groups = frame[GROUP_COL].astype(str).to_numpy()
    return next(splitter.split(frame, frame[TARGET_FAULT].to_numpy(), groups))


def split_frame(frame: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """按 scenario 分组切分为 train/validation/test（约 60/20/20，场景不重叠）。"""

    trainval_idx, test_idx = _grouped_holdout(frame, n_splits=5)
    trainval = frame.iloc[trainval_idx].reset_index(drop=True)
    test_frame = frame.iloc[test_idx].reset_index(drop=True)

    inner_train_idx, val_idx = _grouped_holdout(trainval, n_splits=4)
    train_frame = trainval.iloc[inner_train_idx].reset_index(drop=True)
    validation_frame = trainval.iloc[val_idx].reset_index(drop=True)
    return train_frame, validation_frame, test_frame


def classification_cross_validation(frame: pd.DataFrame) -> dict[str, object]:
    """分组交叉验证，给出分类指标的均值与方差，验证 99% 级别准确率是否稳健。"""

    cv_frame = frame
    if len(cv_frame) > CV_SAMPLE_SIZE:
        cv_frame = cv_frame.sample(n=CV_SAMPLE_SIZE, random_state=RANDOM_SEED).reset_index(drop=True)

    splitter = StratifiedGroupKFold(n_splits=CV_SPLITS, shuffle=True, random_state=RANDOM_SEED)
    groups = cv_frame[GROUP_COL].astype(str).to_numpy()
    accuracies: list[float] = []
    f1_macros: list[float] = []
    for train_idx, test_idx in splitter.split(cv_frame, cv_frame[TARGET_FAULT].to_numpy(), groups):
        fold_train = cv_frame.iloc[train_idx]
        fold_test = cv_frame.iloc[test_idx]
        pipeline = build_feature_pipeline()
        x_train = pipeline.fit_transform(fold_train)
        x_test = pipeline.transform(fold_test)
        classifier = build_fault_classifier(RANDOM_SEED)
        classifier.fit(x_train, fold_train[TARGET_FAULT])
        prediction = classifier.predict(x_test)
        accuracies.append(float(accuracy_score(fold_test[TARGET_FAULT], prediction)))
        f1_macros.append(float(f1_score(fold_test[TARGET_FAULT], prediction, average="macro", zero_division=0)))

    return {
        "n_splits": CV_SPLITS,
        "sample_size": int(len(cv_frame)),
        "grouped_by": GROUP_COL,
        "accuracy_mean": float(np.mean(accuracies)),
        "accuracy_std": float(np.std(accuracies)),
        "f1_macro_mean": float(np.mean(f1_macros)),
        "f1_macro_std": float(np.std(f1_macros)),
        "accuracy_folds": accuracies,
    }


def in_distribution_reference(frame: pd.DataFrame) -> dict[str, object]:
    """随机分层切分（不分组）的分类参考指标。

    这是旧口径：同一 scenario 的相邻时序样本会同时落入训练/测试集，指标偏乐观。
    保留它仅用于与分组切分对照，量化数据泄漏对指标的抬升幅度。
    """

    ref_frame = frame
    if len(ref_frame) > CV_SAMPLE_SIZE:
        ref_frame = ref_frame.sample(n=CV_SAMPLE_SIZE, random_state=RANDOM_SEED).reset_index(drop=True)
    train_frame, test_frame = train_test_split(
        ref_frame,
        test_size=0.2,
        random_state=RANDOM_SEED,
        stratify=ref_frame[TARGET_FAULT],
    )
    pipeline = build_feature_pipeline()
    x_train = pipeline.fit_transform(train_frame)
    x_test = pipeline.transform(test_frame)
    classifier = build_fault_classifier(RANDOM_SEED)
    classifier.fit(x_train, train_frame[TARGET_FAULT])
    prediction = classifier.predict(x_test)

    # 异常检测（监督主通道）在同一随机切分下的参考值
    anomaly_pipeline = build_anomaly_feature_pipeline()
    xa_train = anomaly_pipeline.fit_transform(add_anomaly_features(train_frame))
    xa_test = anomaly_pipeline.transform(add_anomaly_features(test_frame))
    detector = build_supervised_detector(RANDOM_SEED)
    detector.fit(xa_train, train_frame[TARGET_ANOMALY])
    anomaly_pred = detector.predict(xa_test)
    y_test_anomaly = test_frame[TARGET_ANOMALY].to_numpy()

    return {
        "split": "stratified_random_rows (leakage-prone)",
        "sample_size": int(len(ref_frame)),
        "classification_accuracy": float(accuracy_score(test_frame[TARGET_FAULT], prediction)),
        "classification_f1_macro": float(
            f1_score(test_frame[TARGET_FAULT], prediction, average="macro", zero_division=0)
        ),
        "detection_accuracy": float(accuracy_score(y_test_anomaly, anomaly_pred)),
        "detection_recall": float(recall_score(y_test_anomaly, anomaly_pred, zero_division=0)),
        "detection_precision": float(precision_score(y_test_anomaly, anomaly_pred, zero_division=0)),
    }


def train_fusion_anomaly_detector(
    train_frame: pd.DataFrame,
    validation_frame: pd.DataFrame,
) -> tuple[Any, Any, Any, dict[str, object]]:
    """训练异常检测三通道并在验证集上搜索融合权重与阈值。

    返回 (anomaly_feature_pipeline, supervised_detector, isolation_forest, fusion)。
    """

    anomaly_pipeline = build_anomaly_feature_pipeline()
    xa_train = anomaly_pipeline.fit_transform(add_anomaly_features(train_frame))
    xa_validation = anomaly_pipeline.transform(add_anomaly_features(validation_frame))
    y_train = train_frame[TARGET_ANOMALY].to_numpy()
    y_validation = validation_frame[TARGET_ANOMALY].to_numpy()

    supervised = build_supervised_detector(RANDOM_SEED)
    supervised.fit(xa_train, y_train)
    isolation_forest = build_anomaly_detector(RANDOM_SEED)
    isolation_forest.fit(xa_train[y_train == 0])

    if_raw_train = -isolation_forest.decision_function(xa_train)
    if_min = float(if_raw_train.min())
    if_max = float(if_raw_train.max())

    sup_val = _supervised_fault_proba(supervised, xa_validation)
    if_val = normalize_if_scores(-isolation_forest.decision_function(xa_validation), if_min, if_max)
    rule_val = rule_anomaly_score(add_anomaly_features(validation_frame))

    best: dict[str, object] | None = None
    for sup_w, rule_w, if_w in ANOMALY_WEIGHT_GRID:
        weights = {"supervised": sup_w, "rule": rule_w, "isolation_forest": if_w}
        fused = fuse_scores(sup_val, rule_val, if_val, weights)
        threshold = select_anomaly_threshold(fused, y_validation)
        f1 = float(f1_score(y_validation, (fused >= threshold).astype(int), zero_division=0))
        if best is None or f1 > best["f1"]:
            best = {"f1": f1, "weights": weights, "threshold": float(threshold)}

    fusion = {
        "weights": best["weights"],
        "threshold": best["threshold"],
        "if_min": if_min,
        "if_max": if_max,
        "validation_f1": best["f1"],
    }
    return anomaly_pipeline, supervised, isolation_forest, fusion


def _fused_anomaly_prediction(
    frame: pd.DataFrame,
    anomaly_pipeline: Any,
    supervised: Any,
    isolation_forest: Any,
    fusion: dict[str, object],
) -> tuple[np.ndarray, np.ndarray]:
    """返回 (fused_scores, predictions)。"""

    enriched = add_anomaly_features(frame)
    features = anomaly_pipeline.transform(enriched)
    sup = _supervised_fault_proba(supervised, features)
    if_score = normalize_if_scores(
        -isolation_forest.decision_function(features), fusion["if_min"], fusion["if_max"]
    )
    rule = rule_anomaly_score(enriched)
    fused = fuse_scores(sup, rule, if_score, fusion["weights"])
    return fused, (fused >= fusion["threshold"]).astype(int)


def train_models(processed_dir: Path, model_dir: Path, reports_dir: Path, sample_size: int | None) -> dict[str, object]:
    started = time.perf_counter()
    frame = select_telecom_model_frame(load_network_metrics(processed_dir))
    if sample_size and len(frame) > sample_size:
        frame = frame.sample(n=sample_size, random_state=RANDOM_SEED).reset_index(drop=True)

    fault_labels = sorted(frame[TARGET_FAULT].astype(str).unique())
    train_frame, validation_frame, test_frame = split_frame(frame)
    pipeline = build_feature_pipeline()
    x_train = pipeline.fit_transform(train_frame)
    x_test = pipeline.transform(test_frame)

    # 异常检测：监督主通道 + 规则 + IsolationForest 辅助，验证集搜索融合权重与阈值
    anomaly_pipeline, supervised_detector, isolation_forest, fusion = train_fusion_anomaly_detector(
        train_frame, validation_frame
    )
    _, anomaly_prediction = _fused_anomaly_prediction(
        test_frame, anomaly_pipeline, supervised_detector, isolation_forest, fusion
    )
    threshold = float(fusion["threshold"])

    classifier = build_fault_classifier(RANDOM_SEED)
    classifier.fit(x_train, train_frame[TARGET_FAULT])
    fault_prediction = classifier.predict(x_test)
    test_confidence = classifier.predict_proba(x_test).max(axis=1)
    low_confidence_count = int((test_confidence < LOW_CONFIDENCE_THRESHOLD).sum())
    classification_review = {
        "threshold": LOW_CONFIDENCE_THRESHOLD,
        "mean_confidence": float(test_confidence.mean()),
        "low_confidence_count": low_confidence_count,
        "low_confidence_rate": float(low_confidence_count / max(len(test_confidence), 1)),
    }

    training_time_ms = (time.perf_counter() - started) * 1000

    # 真实单批推理耗时：原始测试帧 -> 异常检测融合路径（贴近线上检测）
    detection_started = time.perf_counter()
    _fused_anomaly_prediction(test_frame, anomaly_pipeline, supervised_detector, isolation_forest, fusion)
    detection_latency_ms = (time.perf_counter() - detection_started) * 1000
    per_sample_ms = detection_latency_ms / max(len(test_frame), 1)

    classification_cv = classification_cross_validation(frame)
    reference = in_distribution_reference(frame)
    localization = {
        "primary_track": "synthetic_algorithm",
        "synthetic_algorithm": run_synthetic_localization_benchmark(),
        "public_proxy": localization_error_stats(processed_dir, track="public_proxy"),
    }

    evaluation = assemble_evaluation(
        dataset_rows_used=len(frame),
        train_rows=len(train_frame),
        validation_rows=len(validation_frame),
        test_rows=len(test_frame),
        random_seed=RANDOM_SEED,
        split_strategy=SPLIT_STRATEGY,
        anomaly_threshold=threshold,
        training_time_ms=training_time_ms,
        detection_latency_ms=detection_latency_ms,
        detection_latency_ms_per_sample=per_sample_ms,
        anomaly_true=test_frame[TARGET_ANOMALY].to_numpy(),
        anomaly_pred=anomaly_prediction,
        fault_true=test_frame[TARGET_FAULT].to_numpy(),
        fault_pred=fault_prediction,
        fault_labels=fault_labels,
        average_localization_error_m=average_localization_error(processed_dir),
        localization=localization,
        classification_cv=classification_cv,
        in_distribution_reference=reference,
        classification_review=classification_review,
    )

    model_dir.mkdir(parents=True, exist_ok=True)
    reports_dir.mkdir(parents=True, exist_ok=True)
    figures_dir = reports_dir / "figures"
    joblib.dump(pipeline, model_dir / "feature_pipeline.joblib")
    joblib.dump(classifier, model_dir / "fault_classifier.joblib")
    joblib.dump(anomaly_pipeline, model_dir / "anomaly_feature_pipeline.joblib")
    joblib.dump(supervised_detector, model_dir / "anomaly_supervised.joblib")
    joblib.dump(isolation_forest, model_dir / "anomaly_detector.joblib")
    joblib.dump(fusion, model_dir / "anomaly_fusion.joblib")
    joblib.dump({"threshold": threshold}, model_dir / "anomaly_threshold.joblib")
    (reports_dir / "model_evaluation.json").write_text(
        json.dumps(evaluation, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    classification = evaluation["fault_classification"]
    plot_confusion_matrix(
        classification["labels"],
        classification["confusion_matrix"],
        figures_dir / "confusion_matrix.png",
    )
    plot_localization_error_distribution(
        localization_errors(processed_dir),
        figures_dir / "localization_error_distribution.png",
    )
    return evaluation


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train phase-2 anomaly and fault classification models.")
    parser.add_argument("--processed-dir", type=Path, default=PROCESSED_DIR)
    parser.add_argument("--model-dir", type=Path, default=SAVED_MODELS_DIR)
    parser.add_argument("--reports-dir", type=Path, default=REPORTS_DIR)
    parser.add_argument("--sample-size", type=int, default=80000)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    sample_size = args.sample_size if args.sample_size and args.sample_size > 0 else None
    result = train_models(args.processed_dir, args.model_dir, args.reports_dir, sample_size)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
