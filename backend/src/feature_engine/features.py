from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


NUMERIC_FEATURES = [
    "rsrp",
    "sinr",
    "ber",
    "bler_dl",
    "bler_ul",
    "bandwidth_usage",
    "rb_num",
    "traffic_bytes",
    "packet_count",
    "mcs",
]

CATEGORICAL_FEATURES = [
    "source_dataset",
    "station_id",
    "cell_id",
]

TARGET_ANOMALY = "is_fault"
TARGET_FAULT = "fault_type_cn"


def load_network_metrics(processed_dir: Path) -> pd.DataFrame:
    path = processed_dir / "network_metrics.csv"
    frame = pd.read_csv(path, encoding="utf-8-sig", low_memory=False)
    for column in NUMERIC_FEATURES:
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    for column in CATEGORICAL_FEATURES + [TARGET_FAULT, "fault_type_raw"]:
        frame[column] = frame[column].fillna("").astype(str)
    frame[TARGET_ANOMALY] = pd.to_numeric(frame[TARGET_ANOMALY], errors="coerce").fillna(0).astype(int)
    return frame


def select_telecom_model_frame(frame: pd.DataFrame) -> pd.DataFrame:
    telecom = frame[frame["source_dataset"] == "TelecomTS"].copy()
    telecom = telecom[telecom[TARGET_FAULT] != "未分类故障"].copy()
    return telecom.reset_index(drop=True)


def build_feature_pipeline() -> ColumnTransformer:
    numeric_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )
    categorical_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
        ]
    )
    return ColumnTransformer(
        transformers=[
            ("numeric", numeric_pipeline, NUMERIC_FEATURES),
            ("categorical", categorical_pipeline, CATEGORICAL_FEATURES),
        ]
    )


# ── 异常检测专用特征 ───────────────────────────────────────────────
# 异常检测只用数值 KPI 与无状态派生特征，刻意不含 station_id/cell_id 这类
# 高基数类别：它们会编码场景身份造成泄漏，且 one-hot 后的稀疏维度会干扰
# IsolationForest。派生特征为逐行计算，推理时同样可得，不依赖历史基线。
ANOMALY_DERIVED_FEATURES = [
    "worst_error_rate",
    "signal_score",
    "throughput_per_rb",
    "load_ratio",
]

ANOMALY_FEATURES = NUMERIC_FEATURES + ANOMALY_DERIVED_FEATURES


def add_anomaly_features(frame: pd.DataFrame) -> pd.DataFrame:
    """补充异常检测派生特征（逐行、无状态、NaN 安全）。"""

    enriched = frame.copy()
    ber = pd.to_numeric(enriched.get("ber"), errors="coerce").fillna(0.0)
    bler_dl = pd.to_numeric(enriched.get("bler_dl"), errors="coerce").fillna(0.0)
    bler_ul = pd.to_numeric(enriched.get("bler_ul"), errors="coerce").fillna(0.0)
    rsrp = pd.to_numeric(enriched.get("rsrp"), errors="coerce").fillna(-110.0)
    sinr = pd.to_numeric(enriched.get("sinr"), errors="coerce").fillna(0.0)
    rb_num = pd.to_numeric(enriched.get("rb_num"), errors="coerce")
    throughput = pd.to_numeric(enriched.get("throughput_mbps"), errors="coerce").fillna(0.0)
    bandwidth = pd.to_numeric(enriched.get("bandwidth_usage"), errors="coerce").fillna(0.0)

    enriched["worst_error_rate"] = pd.concat([ber, bler_dl, bler_ul], axis=1).max(axis=1)
    enriched["signal_score"] = rsrp + 2.0 * sinr
    enriched["throughput_per_rb"] = (throughput / rb_num.replace(0, np.nan)).fillna(0.0)
    enriched["load_ratio"] = bandwidth / 100.0
    return enriched


def build_anomaly_feature_pipeline() -> ColumnTransformer:
    """异常检测特征管线：仅数值 KPI + 派生特征，中位数填充 + 标准化。"""

    numeric_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )
    return ColumnTransformer(
        transformers=[("numeric", numeric_pipeline, ANOMALY_FEATURES)]
    )
