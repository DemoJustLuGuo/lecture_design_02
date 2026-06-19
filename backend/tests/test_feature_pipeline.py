from __future__ import annotations

import pandas as pd

from backend.src.feature_engine.features import (
    CATEGORICAL_FEATURES,
    NUMERIC_FEATURES,
    build_feature_pipeline,
)


def sample_frame(rows: int = 6) -> pd.DataFrame:
    data = {feature: [float(i) for i in range(rows)] for feature in NUMERIC_FEATURES}
    for feature in CATEGORICAL_FEATURES:
        data[feature] = [f"{feature}_{i % 2}" for i in range(rows)]
    return pd.DataFrame(data)


def test_pipeline_output_dimension_is_stable_between_fit_and_transform() -> None:
    pipeline = build_feature_pipeline()
    train = sample_frame()
    fitted = pipeline.fit_transform(train)

    # 数值特征逐列保留；类别特征 one-hot 后列数固定
    assert fitted.shape[0] == len(train)
    assert fitted.shape[1] >= len(NUMERIC_FEATURES) + len(CATEGORICAL_FEATURES)

    transformed = pipeline.transform(sample_frame(rows=3))
    assert transformed.shape[1] == fitted.shape[1]


def test_pipeline_handles_unknown_categories_without_changing_width() -> None:
    pipeline = build_feature_pipeline()
    pipeline.fit(sample_frame())

    novel = sample_frame(rows=2)
    for feature in CATEGORICAL_FEATURES:
        novel[feature] = ["unseen_value", "another_new"]
    transformed = pipeline.transform(novel)

    # handle_unknown="ignore" 时未知类别不应改变特征维度
    expected_width = pipeline.transform(sample_frame(rows=2)).shape[1]
    assert transformed.shape[1] == expected_width
