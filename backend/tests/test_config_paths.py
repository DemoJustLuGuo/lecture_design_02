from __future__ import annotations

from backend.src.utils import config


def test_backend_root_points_at_backend_dir() -> None:
    assert config.BACKEND_ROOT.name == "backend"
    assert config.BACKEND_ROOT.is_dir()


def test_derived_paths_are_under_backend_root() -> None:
    assert config.DATA_DIR == config.BACKEND_ROOT / "data"
    assert config.PROCESSED_DIR == config.DATA_DIR / "processed"
    assert config.DATABASE_PATH == config.DATA_DIR / "app.db"
    assert config.SAVED_MODELS_DIR == config.BACKEND_ROOT / "saved_models"
    assert config.FIGURES_DIR == config.REPORTS_DIR / "figures"


def test_schema_path_exists() -> None:
    assert config.SCHEMA_PATH.name == "schema.sql"
    assert config.SCHEMA_PATH.exists()


def test_workspace_root_contains_reference_datasets_anchor() -> None:
    # 外层工作区是 backend 的上三级目录（lesson_design_02）
    assert config.WORKSPACE_ROOT == config.BACKEND_ROOT.parents[2]
    assert config.DATASETS_ROOT == config.WORKSPACE_ROOT / "参考文件" / "datasets"


def test_model_path_uses_known_filenames() -> None:
    for name in ("feature_pipeline", "anomaly_detector", "anomaly_threshold", "fault_classifier"):
        assert config.model_path(name) == config.SAVED_MODELS_DIR / config.MODEL_FILENAMES[name]
