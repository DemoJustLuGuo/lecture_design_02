"""通用模型指标计算工具。

这些是与具体业务无关的纯指标函数，供模型评估（``models/evaluate.py``）
和训练（``models/train.py``）复用。
"""

from __future__ import annotations

import numpy as np
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)


def binary_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    """二分类指标：accuracy / precision / recall / f1。"""

    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "f1": float(f1_score(y_true, y_pred, zero_division=0)),
    }


def multiclass_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    labels: list | None = None,
) -> dict[str, object]:
    """多分类指标：accuracy / 宏平均 precision-recall-f1 / 标签 / 混淆矩阵。

    传入 ``labels`` 可固定标签全集（例如按分组切分后某类未落入测试集时，
    仍输出完整的混淆矩阵，缺失类别行列为 0，便于报告对照）。
    """

    if labels is None:
        labels = sorted(set(y_true) | set(y_pred))
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision_macro": float(precision_score(y_true, y_pred, average="macro", zero_division=0)),
        "recall_macro": float(recall_score(y_true, y_pred, average="macro", zero_division=0)),
        "f1_macro": float(f1_score(y_true, y_pred, average="macro", zero_division=0)),
        "labels": labels,
        "confusion_matrix": confusion_matrix(y_true, y_pred, labels=labels).tolist(),
    }


def select_anomaly_threshold(scores: np.ndarray, y_true: np.ndarray) -> float:
    """在验证集异常分数上扫描分位点，选取使 F1 最优的阈值。"""

    best_threshold = float(np.quantile(scores, 0.5))
    best_score = -1.0
    for threshold in np.quantile(scores, np.linspace(0.05, 0.95, 91)):
        prediction = (scores >= threshold).astype(int)
        score = f1_score(y_true, prediction, zero_division=0)
        if score > best_score:
            best_score = score
            best_threshold = float(threshold)
    return best_threshold
