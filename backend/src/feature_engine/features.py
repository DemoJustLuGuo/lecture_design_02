from __future__ import annotations

from pathlib import Path

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
