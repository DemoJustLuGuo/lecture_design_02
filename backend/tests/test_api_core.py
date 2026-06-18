from __future__ import annotations

from fastapi.testclient import TestClient

from backend.src.api.app import create_app
from backend.src.api.routes import faults as faults_route
from backend.src.database.db import DATABASE_PATH, get_connection


client = TestClient(create_app())


def insert_station(station_id: str = "UNIT_BS") -> None:
    with get_connection(DATABASE_PATH) as connection:
        connection.execute(
            """
            INSERT OR REPLACE INTO base_stations (
              station_id, source_dataset, gnodeb_id, cell_id, pci, longitude,
              latitude, height, azimuth, downtilt, tx_power, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                station_id,
                "unit",
                "UNIT_GNB",
                "UNIT_CELL",
                "101",
                113.25,
                23.12,
                30.0,
                120.0,
                6.0,
                43.0,
                "normal",
            ),
        )
        connection.commit()


def insert_metric(metric_id: str, station_id: str = "UNIT_BS", source_dataset: str = "TelecomTS") -> None:
    with get_connection(DATABASE_PATH) as connection:
        connection.execute(
            """
            INSERT OR REPLACE INTO network_metrics (
              metric_id, source_dataset, scenario_id, timestamp, station_id, cell_id,
              longitude, latitude, rsrp, sinr, ber, bler_dl, bler_ul, bandwidth_usage,
              rb_num, throughput_mbps, traffic_bytes, packet_count, mcs,
              fault_type_raw, fault_type_cn, is_fault
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                metric_id,
                source_dataset,
                "unit",
                "2026-06-16T10:00:00",
                station_id,
                "UNIT_CELL",
                113.25,
                23.12,
                -96.0,
                8.0,
                0.002,
                0.01,
                0.01,
                0.72,
                80.0,
                45.0,
                1024000.0,
                1500.0,
                18.0,
                "unit",
                "信道干扰",
                1,
            ),
        )
        connection.commit()


def insert_fault(fault_id: str, station_id: str = "UNIT_BS", status: str = "未处理") -> None:
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
                station_id,
                "2026-06-16T10:00:00",
                "unit",
                "信道干扰",
                "一般",
                0.91,
                "sinr;ber;throughput_mbps",
                status,
            ),
        )
        connection.commit()


def insert_model_evaluation(evaluation_id: str = "UNIT_EVAL") -> None:
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


def cleanup_unit_records(*, station_id: str = "UNIT_BS") -> None:
    with get_connection(DATABASE_PATH) as connection:
        connection.execute("DELETE FROM diagnosis_records WHERE diagnosis_id LIKE 'UNIT_%' OR fault_id LIKE 'TEST_%'")
        connection.execute("DELETE FROM fault_logs WHERE source_dataset = 'unit' OR fault_id LIKE 'TEST_%'")
        connection.execute("DELETE FROM network_metrics WHERE scenario_id = 'unit' OR metric_id LIKE 'TEST_%'")
        connection.execute("DELETE FROM model_evaluations WHERE evaluation_id LIKE 'UNIT_%'")
        connection.execute("DELETE FROM base_stations WHERE station_id = ?", (station_id,))
        connection.commit()


def assert_success(response) -> dict:
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert "data" in body
    assert "message" in body
    return body


def test_dashboard_summary_api() -> None:
    body = assert_success(client.get("/api/dashboard/summary"))

    assert body["data"]["station_count"] >= 0
    assert body["data"]["fault_count"] >= 0
    assert "classification_accuracy" in body["data"]


def test_dashboard_fault_trend_api() -> None:
    body = assert_success(client.get("/api/dashboard/fault-trend?days=7"))

    assert body["data"]["days"] == 7
    assert len(body["data"]["items"]) == 7
    assert {"date", "label", "total", "severe"}.issubset(body["data"]["items"][0])


def test_stations_and_station_detail_api() -> None:
    station_id = "UNIT_BS_STATION_DETAIL"
    insert_station(station_id)
    insert_metric("TEST_METRIC_STATION_DETAIL", station_id=station_id)
    insert_fault("TEST_STATION_DETAIL_FAULT", station_id=station_id)
    try:
        stations = assert_success(client.get("/api/stations?limit=500"))["data"]
        detail = assert_success(client.get(f"/api/stations/{station_id}"))["data"]

        assert any(station["station_id"] == station_id for station in stations)
        assert detail["station_id"] == station_id
        assert "recent_metrics" in detail
        assert "recent_faults" in detail
    finally:
        cleanup_unit_records(station_id=station_id)


def test_faults_detail_and_diagnosis_api() -> None:
    fault_id = "TEST_FAULT_DIAGNOSIS"
    insert_fault(fault_id)
    try:
        faults = assert_success(client.get("/api/faults?limit=200"))["data"]
        detail = assert_success(client.get(f"/api/faults/{fault_id}"))["data"]
        diagnosis = assert_success(client.get(f"/api/diagnosis/{fault_id}"))["data"]

        assert any(fault["fault_id"] == fault_id for fault in faults)
        assert detail["fault_id"] == fault_id
        assert diagnosis["fault"]["fault_id"] == fault_id
        assert diagnosis["display"]["root_cause"]
        assert diagnosis["display"]["suggested_actions"]
    finally:
        cleanup_unit_records()


def test_fault_status_update_flow_api() -> None:
    fault_id = "TEST_STATUS_FLOW"
    with get_connection(DATABASE_PATH) as connection:
        connection.execute(
            """
            INSERT OR REPLACE INTO fault_logs (
              fault_id, source_dataset, scenario_id, station_id, detected_at,
              fault_type_raw, fault_type_cn, fault_level, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (fault_id, "unit", "unit", "UNIT_BS", "2026-06-16T10:00:00", "unit", "信道干扰", "一般", "未处理"),
        )
        connection.commit()

    try:
        processing = assert_success(client.patch(f"/api/faults/{fault_id}/status", json={"status": "处理中"}))["data"]
        resolved = assert_success(client.patch(f"/api/faults/{fault_id}/status", json={"status": "已处理"}))["data"]
        repeat = assert_success(client.patch(f"/api/faults/{fault_id}/status", json={"status": "已处理"}))["data"]

        assert processing["status"] == "处理中"
        assert resolved["status"] == "已处理"
        assert repeat["status"] == "已处理"
    finally:
        with get_connection(DATABASE_PATH) as connection:
            connection.execute("DELETE FROM fault_logs WHERE fault_id = ?", (fault_id,))
            connection.commit()


def test_fault_status_update_rejects_invalid_transition_and_status() -> None:
    fault_id = "TEST_STATUS_INVALID"
    with get_connection(DATABASE_PATH) as connection:
        connection.execute(
            """
            INSERT OR REPLACE INTO fault_logs (
              fault_id, source_dataset, scenario_id, station_id, detected_at,
              fault_type_raw, fault_type_cn, fault_level, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (fault_id, "unit", "unit", "UNIT_BS", "2026-06-16T10:00:00", "unit", "信道干扰", "一般", "未处理"),
        )
        connection.commit()

    try:
        invalid_transition = client.patch(f"/api/faults/{fault_id}/status", json={"status": "已处理"})
        invalid_status = client.patch(f"/api/faults/{fault_id}/status", json={"status": "挂起"})
        missing_fault = client.patch("/api/faults/not-exist/status", json={"status": "处理中"})

        assert invalid_transition.status_code == 400
        assert invalid_status.status_code == 400
        assert missing_fault.status_code == 404
    finally:
        with get_connection(DATABASE_PATH) as connection:
            connection.execute("DELETE FROM fault_logs WHERE fault_id = ?", (fault_id,))
            connection.commit()


def test_metrics_and_model_evaluation_api() -> None:
    metric_ids = ["TEST_METRIC_Z3", "TEST_METRIC_Z2", "TEST_METRIC_Z1"]
    for metric_id in metric_ids:
        insert_metric(metric_id)
    insert_model_evaluation()
    try:
        metrics = assert_success(client.get("/api/metrics/realtime?limit=3"))["data"]
        evaluation = assert_success(client.get("/api/model/evaluation"))["data"]

        assert len(metrics) == 3
        assert evaluation["evaluations"]
    finally:
        cleanup_unit_records()


def test_model_inference_post_apis(monkeypatch) -> None:
    from backend.src.api.routes import simulation as simulation_route

    for metric_id in ["TEST_METRIC_INF_Z3", "TEST_METRIC_INF_Z2", "TEST_METRIC_INF_Z1"]:
        insert_metric(metric_id, source_dataset="TelecomTS")

    def fake_refresh_demo_database():
        return {
            "processed_data_available": True,
            "database_refreshed": True,
            "mode": "reload_demo_dataset",
            "duration_ms": 1.0,
            "loaded_files": {"network_metrics": 3000},
            "after_counts": {"network_metrics": 3000},
            "fault_type_counts": {"信道干扰": 1},
            "message": "mock refresh",
        }

    monkeypatch.setattr(simulation_route, "refresh_demo_database", fake_refresh_demo_database)
    try:
        detect = assert_success(client.post("/api/faults/detect?limit=3"))["data"]
        classify = assert_success(client.post("/api/faults/classify?limit=3"))["data"]
        simulation = assert_success(client.post("/api/simulation/run"))["data"]

        assert detect["model_available"] is True
        assert detect["sample_count"] == 3
        assert detect["results"][0]["metric_id"]
        assert "is_anomaly" in detect["results"][0]
        assert detect["latency_ms"] >= 0

        assert classify["model_available"] is True
        assert classify["sample_count"] == 3
        assert classify["results"][0]["metric_id"]
        assert classify["results"][0]["predicted_fault_type"]
        assert classify["results"][0]["confidence"] is not None
        assert classify["latency_ms"] >= 0

        assert simulation["processed_data_available"] is True
        assert simulation["database_refreshed"] is True
        assert simulation["mode"] == "reload_demo_dataset"
        assert simulation["duration_ms"] >= 0
        assert simulation["loaded_files"]["network_metrics"] >= 3000
        assert simulation["after_counts"]["network_metrics"] >= 3000
        assert simulation["fault_type_counts"]
    finally:
        cleanup_unit_records()


def test_area_simulation_generates_triangulated_faults(monkeypatch, tmp_path) -> None:
    from backend.src.api.routes import simulation as simulation_route
    from backend.src.data_ingestion.demo_loader import REPORTS_DIR, refresh_demo_database

    db_path = tmp_path / "area.db"

    def fake_refresh_demo_database(processed_dir, reports_dir=REPORTS_DIR):
        return refresh_demo_database(db_path=db_path, processed_dir=processed_dir, reports_dir=reports_dir)

    monkeypatch.setattr(simulation_route, "BACKEND_ROOT", tmp_path)
    monkeypatch.setattr(simulation_route, "refresh_demo_database", fake_refresh_demo_database)

    body = assert_success(
        client.post(
            "/api/simulation/generate-area"
            "?min_lng=113.20&min_lat=23.05&max_lng=113.35&max_lat=23.18"
            "&station_count=6&metric_count=80&fault_ratio=0.2&seed=7&refresh_db=true"
        )
    )["data"]

    assert body["generated"] is True
    assert body["mode"] == "generate_area_synthetic_dataset"
    assert body["parameters"]["area_bounds"]["min_lng"] == 113.20
    assert body["parameters"]["enable_triangulation"] is True
    assert body["generated_files"]["triangulation_observations"] > 0
    assert body["refresh"]["database_refreshed"] is True
    assert body["refresh"]["after_counts"]["fault_logs"] > 0


def test_classify_persist_flag_controls_repository_call(monkeypatch) -> None:
    calls = []

    class FakeRepository:
        def inference_metrics(self, limit=20, metric_id=None, source_dataset="TelecomTS"):
            return [
                {
                    "metric_id": "M_API_001",
                    "source_dataset": "unit",
                    "scenario_id": "api",
                    "station_id": "BS_API",
                }
            ]

        def persist_inference_results(self, records, predictions, mode):
            calls.append({"records": records, "predictions": predictions, "mode": mode})
            return {
                "enabled": True,
                "persisted_count": 1,
                "skipped_count": 0,
                "fault_ids": ["AI_M_API_001"],
            }

    def fake_classify(records):
        return {
            "model_available": True,
            "sample_count": len(records),
            "latency_ms": 0.0,
            "labeled_accuracy": None,
            "predicted_type_counts": {"信道干扰": 1},
            "results": [
                {
                    "metric_id": "M_API_001",
                    "predicted_fault_type": "信道干扰",
                    "confidence": 0.9,
                    "key_metrics": {"sinr": 4.0},
                }
            ],
        }

    monkeypatch.setattr(faults_route, "Repository", FakeRepository)
    monkeypatch.setattr(faults_route, "run_fault_classification", fake_classify)

    without_persist = assert_success(client.post("/api/faults/classify?limit=1"))["data"]
    with_persist = assert_success(client.post("/api/faults/classify?limit=1&persist=true"))["data"]

    assert "persistence" not in without_persist
    assert with_persist["persistence"]["persisted_count"] == 1
    assert calls == [
        {
            "records": [
                {
                    "metric_id": "M_API_001",
                    "source_dataset": "unit",
                    "scenario_id": "api",
                    "station_id": "BS_API",
                }
            ],
            "predictions": [
                {
                    "metric_id": "M_API_001",
                    "predicted_fault_type": "信道干扰",
                    "confidence": 0.9,
                    "key_metrics": {"sinr": 4.0},
                }
            ],
            "mode": "classification",
        }
    ]


def test_detect_persist_flag_controls_repository_call(monkeypatch) -> None:
    calls = []

    class FakeRepository:
        def inference_metrics(self, limit=20, metric_id=None, source_dataset="TelecomTS"):
            return [
                {
                    "metric_id": "M_API_002",
                    "source_dataset": "unit",
                    "scenario_id": "api",
                    "station_id": "BS_API",
                }
            ]

        def persist_inference_results(self, records, predictions, mode):
            calls.append({"records": records, "predictions": predictions, "mode": mode})
            return {
                "enabled": True,
                "persisted_count": 1,
                "skipped_count": 0,
                "fault_ids": ["AI_M_API_002"],
            }

    def fake_detect(records):
        return {
            "model_available": True,
            "sample_count": len(records),
            "anomaly_count": 1,
            "threshold": 0.1,
            "latency_ms": 0.0,
            "labeled_accuracy": None,
            "results": [
                {
                    "metric_id": "M_API_002",
                    "is_anomaly": True,
                    "anomaly_score": 0.2,
                    "threshold": 0.1,
                    "key_metrics": {"sinr": 4.0},
                }
            ],
        }

    monkeypatch.setattr(faults_route, "Repository", FakeRepository)
    monkeypatch.setattr(faults_route, "detect_anomalies", fake_detect)

    without_persist = assert_success(client.post("/api/faults/detect?limit=1"))["data"]
    with_persist = assert_success(client.post("/api/faults/detect?limit=1&persist=true"))["data"]

    assert "persistence" not in without_persist
    assert with_persist["persistence"]["persisted_count"] == 1
    assert calls == [
        {
            "records": [
                {
                    "metric_id": "M_API_002",
                    "source_dataset": "unit",
                    "scenario_id": "api",
                    "station_id": "BS_API",
                }
            ],
            "predictions": [
                {
                    "metric_id": "M_API_002",
                    "is_anomaly": True,
                    "anomaly_score": 0.2,
                    "threshold": 0.1,
                    "key_metrics": {"sinr": 4.0},
                }
            ],
            "mode": "detection",
        }
    ]


def test_not_found_api_shape() -> None:
    response = client.get("/api/stations/not-exist")

    assert response.status_code == 404
    assert response.json()["detail"]["success"] is False
