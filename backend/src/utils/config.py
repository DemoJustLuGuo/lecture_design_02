"""集中管理工程内所有文件系统路径。

业务代码不得自行散落 ``Path(__file__).resolve().parents[N]`` 推导路径，
统一从本模块导入。便于工程迁移和测试时统一覆盖。
"""

from __future__ import annotations

from pathlib import Path


# backend/src/utils/config.py -> parents[2] 即 backend 根目录
BACKEND_ROOT = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BACKEND_ROOT.parent
# 课设外层工作区（lesson_design_02），其下含「参考文件」原始数据集
WORKSPACE_ROOT = BACKEND_ROOT.parents[2]
DATASETS_ROOT = WORKSPACE_ROOT / "参考文件" / "datasets"

# 数据目录
DATA_DIR = BACKEND_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
GENERATED_PREVIEW_DIR = DATA_DIR / "generated_preview"
DATABASE_PATH = DATA_DIR / "app.db"

# 模型与报告目录
SAVED_MODELS_DIR = BACKEND_ROOT / "saved_models"
REPORTS_DIR = BACKEND_ROOT / "reports"
FIGURES_DIR = REPORTS_DIR / "figures"

# 数据库 schema
SCHEMA_PATH = BACKEND_ROOT / "src" / "database" / "schema.sql"

# 模型工件文件名（统一命名，便于训练与推理共享）
MODEL_FILENAMES = {
    "feature_pipeline": "feature_pipeline.joblib",
    "anomaly_detector": "anomaly_detector.joblib",
    "anomaly_threshold": "anomaly_threshold.joblib",
    "fault_classifier": "fault_classifier.joblib",
    # 异常检测双通道融合（监督主通道 + IF 辅助 + 规则）
    "anomaly_feature_pipeline": "anomaly_feature_pipeline.joblib",
    "anomaly_supervised": "anomaly_supervised.joblib",
    "anomaly_fusion": "anomaly_fusion.joblib",
}


def model_path(name: str) -> Path:
    """返回指定模型工件的绝对路径。"""

    return SAVED_MODELS_DIR / MODEL_FILENAMES[name]
