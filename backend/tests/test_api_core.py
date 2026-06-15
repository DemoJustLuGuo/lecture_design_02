from __future__ import annotations

from fastapi.testclient import TestClient

from backend.src.api.app import create_app


client = TestClient(create_app())


def assert_success(response) -> dict:
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert "data" in body
    assert "message" in body
    return body


def test_dashboard_summary_api() -> None:
    body = assert_success(client.get("/api/dashboard/summary"))

    assert body["data"]["station_count"] > 0
    assert body["data"]["fault_count"] > 0


def test_stations_and_station_detail_api() -> None:
    stations = assert_success(client.get("/api/stations?limit=1"))["data"]
    station_id = stations[0]["station_id"]
    detail = assert_success(client.get(f"/api/stations/{station_id}"))["data"]

    assert detail["station_id"] == station_id


def test_faults_detail_and_diagnosis_api() -> None:
    faults = assert_success(client.get("/api/faults?limit=1"))["data"]
    fault_id = faults[0]["fault_id"]

    detail = assert_success(client.get(f"/api/faults/{fault_id}"))["data"]
    diagnosis = assert_success(client.get(f"/api/diagnosis/{fault_id}"))["data"]

    assert detail["fault_id"] == fault_id
    assert diagnosis["fault"]["fault_id"] == fault_id


def test_metrics_and_model_evaluation_api() -> None:
    metrics = assert_success(client.get("/api/metrics/realtime?limit=3"))["data"]
    evaluation = assert_success(client.get("/api/model/evaluation"))["data"]

    assert len(metrics) == 3
    assert evaluation["evaluations"]


def test_model_inference_post_apis() -> None:
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


def test_not_found_api_shape() -> None:
    response = client.get("/api/stations/not-exist")

    assert response.status_code == 404
    assert response.json()["detail"]["success"] is False
