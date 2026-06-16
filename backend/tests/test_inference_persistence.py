from __future__ import annotations

from pathlib import Path

from backend.src.database.db import initialize_schema
from backend.src.database.repository import Repository


def make_repo(tmp_path: Path) -> Repository:
    db_path = tmp_path / "app.db"
    initialize_schema(db_path)
    return Repository(db_path=db_path)


def seed_diagnosis_template(repo: Repository) -> None:
    from backend.src.database.db import get_connection

    with get_connection(repo.db_path) as connection:
        connection.execute(
            """
            INSERT INTO diagnosis_records (
              diagnosis_id, fault_id, fault_type_cn, root_cause, suggested_actions,
              affected_scope, review_required, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "TPL_SIGNAL",
                None,
                "信道干扰",
                "同频干扰导致SINR下降。",
                "排查干扰源并调整频点。",
                "小区覆盖范围内用户。",
                0,
                "2026-06-16T00:00:00",
            ),
        )
        connection.commit()


def metric_record(metric_id: str = "M_TEST_001") -> dict:
    return {
        "metric_id": metric_id,
        "source_dataset": "unit",
        "scenario_id": "scenario-a",
        "station_id": "BS_001",
        "longitude": 120.1,
        "latitude": 30.2,
    }


def classification_prediction(metric_id: str = "M_TEST_001", confidence: float = 0.91) -> dict:
    return {
        "metric_id": metric_id,
        "predicted_fault_type": "信道干扰",
        "confidence": confidence,
        "key_metrics": {"sinr": 5.0, "ber": 0.04},
    }


def detection_prediction(metric_id: str = "M_TEST_001", is_anomaly: bool = True) -> dict:
    return {
        "metric_id": metric_id,
        "is_anomaly": is_anomaly,
        "key_metrics": {"sinr": 5.0, "ber": 0.04},
    }


def test_persist_classification_writes_fault_and_diagnosis_snapshot(tmp_path: Path) -> None:
    repo = make_repo(tmp_path)
    seed_diagnosis_template(repo)

    result = repo.persist_inference_results(
        records=[metric_record()],
        predictions=[classification_prediction()],
        mode="classification",
    )

    assert result["enabled"] is True
    assert result["persisted_count"] == 1
    assert result["skipped_count"] == 0
    assert result["fault_ids"] == ["AI_M_TEST_001"]

    fault = repo.get_fault("AI_M_TEST_001")
    diagnosis = repo.diagnosis_for_fault("AI_M_TEST_001")

    assert fault is not None
    assert fault["fault_type_cn"] == "信道干扰"
    assert fault["confidence"] == 0.91
    assert fault["fault_level"] == "一般"
    assert fault["status"] == "未处理"
    assert fault["fault_longitude"] == 120.1
    assert fault["fault_latitude"] == 30.2
    assert fault["affected_kpis"] == "sinr;ber"

    assert diagnosis is not None
    assert diagnosis["diagnosis_id"] == "DIA_AI_M_TEST_001"
    assert diagnosis["fault_id"] == "AI_M_TEST_001"
    assert diagnosis["root_cause"] == "同频干扰导致SINR下降。"
    assert diagnosis["suggested_actions"] == "排查干扰源并调整频点。"
    assert diagnosis["fault"]["fault_id"] == "AI_M_TEST_001"


def test_persist_classification_is_idempotent_for_same_metric(tmp_path: Path) -> None:
    repo = make_repo(tmp_path)

    first = repo.persist_inference_results(
        records=[metric_record()],
        predictions=[classification_prediction(confidence=0.7)],
        mode="classification",
    )
    second = repo.persist_inference_results(
        records=[metric_record()],
        predictions=[classification_prediction(confidence=0.95)],
        mode="classification",
    )

    assert first["persisted_count"] == 1
    assert second["persisted_count"] == 1
    assert repo.get_fault("AI_M_TEST_001")["confidence"] == 0.95
    assert len(repo.list_faults(limit=10)) == 1


def test_persist_classification_keeps_existing_process_status(tmp_path: Path) -> None:
    repo = make_repo(tmp_path)

    repo.persist_inference_results(
        records=[metric_record()],
        predictions=[classification_prediction(confidence=0.7)],
        mode="classification",
    )
    repo.update_fault_status("AI_M_TEST_001", "处理中")
    repo.persist_inference_results(
        records=[metric_record()],
        predictions=[classification_prediction(confidence=0.95)],
        mode="classification",
    )

    fault = repo.get_fault("AI_M_TEST_001")

    assert fault["confidence"] == 0.95
    assert fault["status"] == "处理中"
    assert len(repo.list_faults(limit=10)) == 1


def test_classification_updates_prior_unclassified_detection(tmp_path: Path) -> None:
    repo = make_repo(tmp_path)

    detect_result = repo.persist_inference_results(
        records=[metric_record()],
        predictions=[detection_prediction()],
        mode="detection",
    )
    classify_result = repo.persist_inference_results(
        records=[metric_record()],
        predictions=[classification_prediction()],
        mode="classification",
    )

    assert detect_result["persisted_count"] == 1
    assert classify_result["persisted_count"] == 1
    fault = repo.get_fault("AI_M_TEST_001")
    diagnosis = repo.diagnosis_for_fault("AI_M_TEST_001")

    assert fault["fault_type_cn"] == "信道干扰"
    assert fault["confidence"] == 0.91
    assert diagnosis["fault_type_cn"] == "信道干扰"
    assert len(repo.list_faults(limit=10)) == 1


def test_detection_skips_existing_classified_fault(tmp_path: Path) -> None:
    repo = make_repo(tmp_path)

    repo.persist_inference_results(
        records=[metric_record()],
        predictions=[classification_prediction()],
        mode="classification",
    )
    result = repo.persist_inference_results(
        records=[metric_record()],
        predictions=[detection_prediction()],
        mode="detection",
    )

    assert result["persisted_count"] == 0
    assert result["skipped_count"] == 1
    assert repo.get_fault("AI_M_TEST_001")["fault_type_cn"] == "信道干扰"


def test_persistence_skips_normal_classification_and_non_anomaly(tmp_path: Path) -> None:
    repo = make_repo(tmp_path)

    classify = repo.persist_inference_results(
        records=[metric_record("M_NORMAL")],
        predictions=[
            {
                "metric_id": "M_NORMAL",
                "predicted_fault_type": "正常",
                "confidence": 0.99,
                "key_metrics": {},
            }
        ],
        mode="classification",
    )
    detect = repo.persist_inference_results(
        records=[metric_record("M_OK")],
        predictions=[detection_prediction("M_OK", is_anomaly=False)],
        mode="detection",
    )

    assert classify["persisted_count"] == 0
    assert classify["skipped_count"] == 1
    assert detect["persisted_count"] == 0
    assert detect["skipped_count"] == 1


def test_list_faults_filters_by_status_and_source(tmp_path: Path) -> None:
    repo = make_repo(tmp_path)

    repo.persist_inference_results(
        records=[metric_record("M_AI")],
        predictions=[classification_prediction("M_AI")],
        mode="classification",
    )

    from backend.src.database.db import get_connection

    with get_connection(repo.db_path) as connection:
        connection.execute(
            """
            INSERT INTO fault_logs (
              fault_id, source_dataset, scenario_id, station_id, detected_at,
              fault_type_raw, fault_type_cn, fault_level, confidence,
              fault_longitude, fault_latitude, localization_error_m, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "HISTORY_001",
                "unit",
                "scenario-a",
                "BS_002",
                "2026-06-16T00:00:00",
                "manual",
                "基站故障",
                "严重",
                None,
                None,
                None,
                None,
                "已处理",
            ),
        )
        connection.commit()

    ai_faults = repo.list_faults(source="ai", limit=10)
    history_faults = repo.list_faults(source="history", limit=10)
    handled_faults = repo.list_faults(status="已处理", limit=10)

    assert [fault["fault_id"] for fault in ai_faults] == ["AI_M_AI"]
    assert [fault["fault_id"] for fault in history_faults] == ["HISTORY_001"]
    assert [fault["fault_id"] for fault in handled_faults] == ["HISTORY_001"]


def test_fault_trend_groups_recent_days(tmp_path: Path) -> None:
    repo = make_repo(tmp_path)

    from backend.src.database.db import get_connection

    with get_connection(repo.db_path) as connection:
        connection.executemany(
            """
            INSERT INTO fault_logs (
              fault_id, source_dataset, scenario_id, station_id, detected_at,
              fault_type_raw, fault_type_cn, fault_level, confidence,
              fault_longitude, fault_latitude, localization_error_m, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    "F_0614",
                    "unit",
                    "scenario-a",
                    "BS_001",
                    "2026-06-14T10:00:00",
                    "manual",
                    "信道干扰",
                    "严重",
                    None,
                    None,
                    None,
                    None,
                    "未处理",
                ),
                (
                    "F_0616",
                    "unit",
                    "scenario-a",
                    "BS_002",
                    "2026-06-16T10:00:00",
                    "manual",
                    "带宽不足",
                    "一般",
                    None,
                    None,
                    None,
                    None,
                    "未处理",
                ),
            ],
        )
        connection.commit()

    trend = repo.fault_trend(days=3)

    assert trend["start_date"] == "2026-06-14"
    assert trend["end_date"] == "2026-06-16"
    assert trend["items"] == [
        {"date": "2026-06-14", "label": "06-14", "total": 1, "severe": 1},
        {"date": "2026-06-15", "label": "06-15", "total": 0, "severe": 0},
        {"date": "2026-06-16", "label": "06-16", "total": 1, "severe": 0},
    ]


def test_get_station_returns_recent_metrics_and_station_faults(tmp_path: Path) -> None:
    repo = make_repo(tmp_path)

    from backend.src.database.db import get_connection

    with get_connection(repo.db_path) as connection:
        connection.execute(
            """
            INSERT INTO base_stations (
              station_id, source_dataset, gnodeb_id, cell_id, pci, longitude, latitude,
              height, azimuth, downtilt, tx_power, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "BS_001",
                "unit",
                "GNB_001",
                "CELL_001",
                "101",
                120.1,
                30.2,
                35,
                90,
                3,
                43,
                "online",
            ),
        )
        connection.executemany(
            """
            INSERT INTO network_metrics (
              metric_id, source_dataset, scenario_id, timestamp, station_id, cell_id,
              longitude, latitude, rsrp, sinr, ber, bler_dl, bler_ul, bandwidth_usage,
              rb_num, throughput_mbps, traffic_bytes, packet_count, mcs,
              fault_type_raw, fault_type_cn, is_fault
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    "M_001",
                    "unit",
                    "scenario-a",
                    "2026-06-16T10:00:00",
                    "BS_001",
                    "CELL_001",
                    120.1,
                    30.2,
                    -95,
                    18,
                    0.001,
                    None,
                    None,
                    35,
                    50,
                    100,
                    None,
                    None,
                    None,
                    "",
                    "正常",
                    0,
                ),
                (
                    "M_002",
                    "unit",
                    "scenario-a",
                    "2026-06-16T10:05:00",
                    "BS_001",
                    "CELL_001",
                    120.1,
                    30.2,
                    -110,
                    8,
                    0.02,
                    None,
                    None,
                    80,
                    50,
                    30,
                    None,
                    None,
                    None,
                    "interference",
                    "信道干扰",
                    1,
                ),
            ],
        )
        connection.executemany(
            """
            INSERT INTO fault_logs (
              fault_id, source_dataset, scenario_id, station_id, detected_at,
              fault_type_raw, fault_type_cn, fault_level, confidence,
              fault_longitude, fault_latitude, localization_error_m, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    "F_BS_001",
                    "unit",
                    "scenario-a",
                    "BS_001",
                    "2026-06-16T10:05:00",
                    "interference",
                    "信道干扰",
                    "严重",
                    0.92,
                    120.1,
                    30.2,
                    12,
                    "未处理",
                ),
                (
                    "F_BS_002",
                    "unit",
                    "scenario-a",
                    "BS_002",
                    "2026-06-16T10:06:00",
                    "bandwidth",
                    "带宽不足",
                    "一般",
                    0.88,
                    None,
                    None,
                    None,
                    "未处理",
                ),
            ],
        )
        connection.commit()

    station = repo.get_station("BS_001")

    assert station is not None
    assert station["station_id"] == "BS_001"
    assert [metric["timestamp"] for metric in station["recent_metrics"]] == [
        "2026-06-16T10:00:00",
        "2026-06-16T10:05:00",
    ]
    assert [fault["fault_id"] for fault in station["recent_faults"]] == ["F_BS_001"]


def test_diagnosis_display_uses_chinese_rules_over_english_template(tmp_path: Path) -> None:
    repo = make_repo(tmp_path)

    from backend.src.database.db import get_connection

    with get_connection(repo.db_path) as connection:
        connection.execute(
            """
            INSERT INTO fault_logs (
              fault_id, source_dataset, scenario_id, station_id, detected_at,
              fault_type_raw, fault_type_cn, fault_level, confidence, affected_kpis,
              fault_longitude, fault_latitude, localization_error_m, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "F_ENGLISH_TEMPLATE",
                "unit",
                "scenario-a",
                "BS_001",
                "2026-06-16T10:05:00",
                "Jamming",
                "信道干扰",
                "严重",
                0.67,
                "DL_BLER;UL_MCS;TX_Bytes",
                120.1,
                30.2,
                15.0,
                "未处理",
            ),
        )
        connection.execute(
            """
            INSERT INTO diagnosis_records (
              diagnosis_id, fault_id, fault_type_cn, root_cause, suggested_actions,
              affected_scope, review_required, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "TPL_EN",
                None,
                "信道干扰",
                "Jamming",
                "**Diagnose Summary:** **Issue:** severe wireless interference. **Resolution:** locate jammer.",
                "",
                1,
                "2026-06-16T10:05:00",
            ),
        )
        connection.commit()

    diagnosis = repo.diagnosis_for_fault("F_ENGLISH_TEMPLATE")

    assert diagnosis is not None
    assert "无线信道受到" in diagnosis["root_cause"]
    assert "定位干扰来源" in diagnosis["suggested_actions"]
    assert diagnosis["display"]["fault_type"] == "信道干扰"
    assert diagnosis["display"]["review_required"] is True
    assert "下行BLER误块率" in diagnosis["display"]["evidence"][0]
    assert diagnosis["display"]["suggested_actions"][0]["title"] == "定位干扰来源"
