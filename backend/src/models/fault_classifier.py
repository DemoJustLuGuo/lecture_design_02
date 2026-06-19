"""故障分类模型：构建训练器与运行时调用。

采用 RandomForestClassifier 输出故障类型与置信度。
``build_fault_classifier`` 供训练流程使用，``classify_faults`` 供 API 推理使用。
"""

from __future__ import annotations

import time
from collections import Counter
from typing import Any

from sklearn.ensemble import RandomForestClassifier

from backend.src.models.artifacts import (
    as_frame,
    classifier_model_available,
    key_metrics,
    load_model_artifacts,
    model_paths,
    record_identity,
)


def build_fault_classifier(random_seed: int) -> RandomForestClassifier:
    """构建未训练的故障分类器（参数集中在此，便于复现与调参）。"""

    return RandomForestClassifier(
        n_estimators=220,
        random_state=random_seed,
        n_jobs=-1,
        class_weight="balanced_subsample",
        min_samples_leaf=2,
    )


# 低置信度人工复核阈值：分类最高类别概率低于该值时标记为需人工复核。
LOW_CONFIDENCE_THRESHOLD = 0.6


def needs_review(confidence: float | None, threshold: float = LOW_CONFIDENCE_THRESHOLD) -> bool:
    """置信度低于阈值（或缺失）时建议人工复核。"""

    return confidence is None or confidence < threshold


def classify_faults(records: list[dict[str, Any]]) -> dict[str, Any]:
    """对一批指标记录执行故障分类，返回逐条预测、置信度与汇总。"""

    started = time.perf_counter()
    artifacts = load_model_artifacts()
    frame = as_frame(records)
    transformed = artifacts.feature_pipeline.transform(frame)
    predictions = artifacts.fault_classifier.predict(transformed)
    probabilities = artifacts.fault_classifier.predict_proba(transformed)
    classes = [str(label) for label in artifacts.fault_classifier.classes_]
    elapsed_ms = (time.perf_counter() - started) * 1000

    results = []
    labeled_total = 0
    labeled_correct = 0
    review_count = 0
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
        confidence = max(class_probabilities.values()) if class_probabilities else None
        review_required = needs_review(confidence)
        review_count += int(review_required)
        results.append(
            {
                **record_identity(record),
                "predicted_fault_type": predicted_fault_type,
                "confidence": confidence,
                "probabilities": class_probabilities,
                "review_required": review_required,
                "review_reason": (
                    f"分类置信度 {confidence:.2f} 低于阈值 {LOW_CONFIDENCE_THRESHOLD}，建议人工复核。"
                    if review_required
                    else None
                ),
                "key_metrics": key_metrics(record),
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
        "review_threshold": LOW_CONFIDENCE_THRESHOLD,
        "review_required_count": review_count,
        "results": results,
    }
