"""异常检测：监督主通道 + 规则通道 + IsolationForest 辅助的融合检测。

设计要点：
- 监督二分类（RandomForest，目标 is_fault）作为主通道，是有标签时最强的信号；
- 通信规则通道（RSRP/SINR/BER-BLER/带宽/吞吐/MCS 阈值）提供高置信、可解释的判据；
- IsolationForest 作为无监督辅助通道，对未知形态异常兜底；
- 三路分数归一到 [0,1] 后加权求和，权重与最终阈值在验证集上联合搜索
  （不是简单 OR：OR 会抬高 recall 但拉低 precision）。

异常检测使用数值 KPI + 派生特征（``feature_engine.build_anomaly_feature_pipeline``），
不含 station_id/cell_id 等高基数类别，避免泄漏与稀疏维度干扰。
"""

from __future__ import annotations

import time
from typing import Any

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest, RandomForestClassifier

from backend.src.models.artifacts import (
    anomaly_model_available,
    as_anomaly_frame,
    key_metrics,
    load_model_artifacts,
    model_paths,
    record_identity,
)


def build_anomaly_detector(random_seed: int) -> IsolationForest:
    """构建未训练的无监督异常检测器（辅助通道）。"""

    return IsolationForest(
        n_estimators=160,
        contamination=0.1,
        random_state=random_seed,
        n_jobs=-1,
    )


def build_supervised_detector(random_seed: int) -> RandomForestClassifier:
    """构建未训练的监督异常检测器（主通道，目标 is_fault）。"""

    return RandomForestClassifier(
        n_estimators=200,
        random_state=random_seed,
        n_jobs=-1,
        class_weight="balanced",
        min_samples_leaf=2,
    )


def rule_anomaly_score(frame: pd.DataFrame) -> np.ndarray:
    """基于通信 KPI 阈值的规则异常分数，取触发条件比例 ∈ [0,1]。

    缺失值用"正常"默认值填充，避免缺字段误触发。
    """

    def column(name: str, normal_default: float) -> pd.Series:
        return pd.to_numeric(frame.get(name), errors="coerce").fillna(normal_default)

    rsrp = column("rsrp", -90.0)
    sinr = column("sinr", 15.0)
    bandwidth = column("bandwidth_usage", 50.0)
    throughput = column("throughput_mbps", 200.0)
    mcs = column("mcs", 15.0)
    ber = column("ber", 0.0)
    bler_dl = column("bler_dl", 0.0)
    bler_ul = column("bler_ul", 0.0)
    worst_error = pd.concat([ber, bler_dl, bler_ul], axis=1).max(axis=1)

    conditions = [
        rsrp < -105.0,        # 信号过弱
        sinr < 5.0,           # 干扰严重
        worst_error > 0.05,   # 误码/误块过高
        bandwidth > 88.0,     # 带宽紧张
        throughput < 20.0,    # 吞吐塌陷
        mcs < 6.0,            # 调制等级过低
    ]
    triggered = np.sum([cond.to_numpy().astype(float) for cond in conditions], axis=0)
    return triggered / len(conditions)


def _supervised_fault_proba(model: RandomForestClassifier, features: np.ndarray) -> np.ndarray:
    proba = model.predict_proba(features)
    classes = list(model.classes_)
    fault_index = classes.index(1) if 1 in classes else len(classes) - 1
    return proba[:, fault_index]


def normalize_if_scores(raw_scores: np.ndarray, if_min: float, if_max: float) -> np.ndarray:
    span = max(if_max - if_min, 1e-9)
    return np.clip((raw_scores - if_min) / span, 0.0, 1.0)


def fuse_scores(
    supervised: np.ndarray,
    rule: np.ndarray,
    isolation_forest: np.ndarray,
    weights: dict[str, float],
) -> np.ndarray:
    return (
        weights["supervised"] * supervised
        + weights["rule"] * rule
        + weights["isolation_forest"] * isolation_forest
    )


def detect_anomalies(records: list[dict[str, Any]]) -> dict[str, Any]:
    """对一批指标记录执行融合异常检测，返回逐条结果与汇总指标。"""

    started = time.perf_counter()
    artifacts = load_model_artifacts()
    fusion = artifacts.anomaly_fusion
    weights = fusion["weights"]
    threshold = float(fusion["threshold"])

    frame = as_anomaly_frame(records)
    features = artifacts.anomaly_feature_pipeline.transform(frame)
    supervised = _supervised_fault_proba(artifacts.anomaly_supervised, features)
    if_raw = -artifacts.anomaly_detector.decision_function(features)
    if_score = normalize_if_scores(if_raw, fusion["if_min"], fusion["if_max"])
    rule = rule_anomaly_score(frame)
    fused = fuse_scores(supervised, rule, if_score, weights)
    predictions = (fused >= threshold).astype(int)
    elapsed_ms = (time.perf_counter() - started) * 1000

    results = []
    labeled_total = 0
    labeled_correct = 0
    for index, record in enumerate(records):
        actual_is_fault = record.get("is_fault")
        prediction = int(predictions[index])
        if actual_is_fault is not None:
            labeled_total += 1
            labeled_correct += int(int(actual_is_fault) == prediction)
        results.append(
            {
                **record_identity(record),
                "is_anomaly": bool(prediction),
                "anomaly_score": float(fused[index]),
                "threshold": threshold,
                "sub_scores": {
                    "supervised": float(supervised[index]),
                    "rule": float(rule[index]),
                    "isolation_forest": float(if_score[index]),
                },
                "key_metrics": key_metrics(record),
            }
        )

    return {
        "model_available": anomaly_model_available(),
        **model_paths(),
        "fusion_weights": weights,
        "sample_count": len(records),
        "anomaly_count": int(predictions.sum()),
        "threshold": threshold,
        "latency_ms": float(elapsed_ms),
        "labeled_accuracy": (labeled_correct / labeled_total) if labeled_total else None,
        "results": results,
    }
