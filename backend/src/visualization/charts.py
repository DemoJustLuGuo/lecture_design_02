"""模型评估相关图表生成。

图表函数接收已经计算好的数据（混淆矩阵、误差序列），不在内部触碰模型，
便于训练流程和报告脚本复用。所有图表统一使用 Agg 后端，可在无显示环境运行。
"""

from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

# 中文字体，避免标签显示为方块
_CN_FONT = "SimHei"


def plot_confusion_matrix(labels: list[str], matrix: list[list[int]], output_path: Path) -> Path:
    """绘制故障分类混淆矩阵热力图。"""

    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig, ax = plt.subplots(figsize=(8, 6))
    image = ax.imshow(matrix, cmap="Blues")
    ax.set_xticks(range(len(labels)))
    ax.set_yticks(range(len(labels)))
    ax.set_xticklabels(labels, rotation=35, ha="right", fontproperties=_CN_FONT)
    ax.set_yticklabels(labels, fontproperties=_CN_FONT)
    ax.set_xlabel("预测类别", fontproperties=_CN_FONT)
    ax.set_ylabel("真实类别", fontproperties=_CN_FONT)
    ax.set_title("故障分类混淆矩阵", fontproperties=_CN_FONT)
    for i, row in enumerate(matrix):
        for j, value in enumerate(row):
            ax.text(j, i, str(value), ha="center", va="center", fontsize=8)
    fig.colorbar(image, ax=ax, fraction=0.046, pad=0.04)
    fig.tight_layout()
    fig.savefig(output_path, dpi=160)
    plt.close(fig)
    return output_path


def plot_localization_error_distribution(errors: list[float], output_path: Path) -> Path:
    """绘制故障定位误差分布直方图。"""

    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig, ax = plt.subplots(figsize=(8, 5))
    ax.hist(errors, bins=30, color="#2f6f9f", edgecolor="white")
    ax.set_xlabel("定位误差 / m", fontproperties=_CN_FONT)
    ax.set_ylabel("样本数", fontproperties=_CN_FONT)
    ax.set_title("故障定位误差分布", fontproperties=_CN_FONT)
    fig.tight_layout()
    fig.savefig(output_path, dpi=160)
    plt.close(fig)
    return output_path
