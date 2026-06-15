from __future__ import annotations

from pathlib import Path

from backend.src.database.db import DATABASE_PATH
from backend.src.database.repository import Repository


def test_database_file_exists() -> None:
    assert DATABASE_PATH.exists()
    assert DATABASE_PATH.stat().st_size > 0


def test_repository_dashboard_summary() -> None:
    summary = Repository().dashboard_summary()

    assert summary["station_count"] > 0
    assert summary["fault_count"] > 0
    assert summary["classification_accuracy"] > 0
    assert summary["fault_type_counts"]


def test_repository_fault_detail_and_diagnosis() -> None:
    repo = Repository()
    fault = repo.list_faults(limit=1)[0]
    detail = repo.get_fault(fault["fault_id"])
    diagnosis = repo.diagnosis_for_fault(fault["fault_id"])

    assert detail is not None
    assert detail["fault_id"] == fault["fault_id"]
    assert diagnosis is not None
    assert diagnosis["fault"]["fault_id"] == fault["fault_id"]


def test_repository_model_evaluation() -> None:
    evaluations = Repository().model_evaluation()["evaluations"]
    names = {item["model_name"] for item in evaluations}

    assert {"IsolationForest", "RandomForestClassifier"}.issubset(names)
