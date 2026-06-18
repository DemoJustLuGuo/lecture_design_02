from __future__ import annotations

from pathlib import Path

from backend.src.database.db import DATABASE_PATH, get_connection
from backend.src.database.repository import Repository


def insert_fault(fault_id: str = "TEST_REPOSITORY_FAULT") -> None:
    with get_connection(DATABASE_PATH) as connection:
        connection.execute(
            """
            INSERT OR REPLACE INTO fault_logs (
              fault_id, source_dataset, scenario_id, station_id, detected_at,
              fault_type_raw, fault_type_cn, fault_level, confidence, affected_kpis,
              status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                fault_id,
                "unit",
                "unit",
                "UNIT_BS",
                "2026-06-16T10:00:00",
                "unit",
                "信道干扰",
                "一般",
                0.91,
                "sinr;ber;throughput_mbps",
                "未处理",
            ),
        )
        connection.commit()


def insert_model_evaluation(evaluation_id: str = "UNIT_REPOSITORY_EVAL") -> None:
    with get_connection(DATABASE_PATH) as connection:
        connection.execute(
            """
            INSERT OR REPLACE INTO model_evaluations (
              evaluation_id, model_name, dataset_version, accuracy, precision,
              recall, f1, confusion_matrix, localization_error_avg_m,
              detection_latency_ms, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                evaluation_id,
                "RandomForestClassifier",
                "unit",
                0.91,
                0.9,
                0.92,
                0.91,
                '{"labels":["信道干扰"],"matrix":[[1]]}',
                42.0,
                12.0,
                "2026-06-16T10:00:00",
            ),
        )
        connection.commit()


def cleanup_unit_records() -> None:
    with get_connection(DATABASE_PATH) as connection:
        connection.execute("DELETE FROM fault_logs WHERE source_dataset = 'unit' OR fault_id LIKE 'TEST_%'")
        connection.execute("DELETE FROM model_evaluations WHERE evaluation_id LIKE 'UNIT_%'")
        connection.commit()


def test_database_file_exists() -> None:
    assert DATABASE_PATH.exists()
    assert DATABASE_PATH.stat().st_size > 0


def test_repository_dashboard_summary() -> None:
    summary = Repository().dashboard_summary()

    assert summary["station_count"] >= 0
    assert summary["fault_count"] >= 0
    assert "classification_accuracy" in summary
    assert isinstance(summary["fault_type_counts"], list)


def test_repository_fault_detail_and_diagnosis() -> None:
    fault_id = "TEST_REPOSITORY_FAULT"
    insert_fault(fault_id)
    repo = Repository()
    try:
        fault = repo.get_fault(fault_id)
        diagnosis = repo.diagnosis_for_fault(fault_id)

        assert fault is not None
        assert fault["fault_id"] == fault_id
        assert diagnosis is not None
        assert diagnosis["fault"]["fault_id"] == fault_id
    finally:
        cleanup_unit_records()


def test_repository_model_evaluation() -> None:
    insert_model_evaluation()
    try:
        evaluations = Repository().model_evaluation()["evaluations"]
        names = {item["model_name"] for item in evaluations}

        assert "RandomForestClassifier" in names
    finally:
        cleanup_unit_records()
