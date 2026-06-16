from __future__ import annotations

import csv
from io import StringIO
from pathlib import Path

from fastapi.testclient import TestClient

from backend.src.api.app import create_app
from backend.src.data_ingestion.external_importer import import_external_network_data
from backend.src.data_ingestion.demo_loader import REPORTS_DIR, refresh_demo_database
from backend.src.data_sim.synthetic_generator import FAULT_TYPES, generate_synthetic_processed_dataset
from backend.src.database.db import get_connection
from backend.src.database.init_db import initialize_database


def csv_bytes(rows: list[dict[str, object]]) -> bytes:
    buffer = StringIO()
    writer = csv.DictWriter(buffer, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue().encode("utf-8")


def test_generate_synthetic_processed_dataset_outputs_required_files(tmp_path: Path) -> None:
    result = generate_synthetic_processed_dataset(
        output_dir=tmp_path,
        station_count=8,
        metric_count=3000,
        fault_ratio=0.2,
        seed=42,
    )

    assert result["generated"] is True
    assert result["generated_files"]["network_metrics"] == 3000
    assert result["generated_files"]["base_stations"] == 8
    assert set(result["fault_type_counts"]).issuperset(set(FAULT_TYPES))
    for filename in [
        "base_stations.csv",
        "network_metrics.csv",
        "fault_samples.csv",
        "diagnosis_knowledge.csv",
        "location_samples.csv",
        "root_cause_samples.csv",
        "dataset_manifest.json",
    ]:
        assert (tmp_path / filename).exists()


def test_generated_dataset_can_refresh_temp_sqlite(tmp_path: Path) -> None:
    processed_dir = tmp_path / "processed"
    db_path = tmp_path / "generated.db"
    generate_synthetic_processed_dataset(processed_dir, station_count=5, metric_count=3000, fault_ratio=0.2, seed=42)

    result = refresh_demo_database(db_path=db_path, processed_dir=processed_dir, reports_dir=REPORTS_DIR)

    assert result["database_refreshed"] is True
    assert result["after_counts"]["network_metrics"] == 3000
    assert result["after_counts"]["fault_logs"] > 0


def test_external_import_appends_and_skips_duplicate_metric_ids(tmp_path: Path) -> None:
    processed_dir = tmp_path / "processed"
    db_path = tmp_path / "import.db"
    generate_synthetic_processed_dataset(processed_dir, station_count=2, metric_count=10, fault_ratio=0.2, seed=7)
    initialize_database(db_path=db_path, processed_dir=processed_dir, reports_dir=REPORTS_DIR)
    rows = [
        {
            "metric_id": "EXT_M001",
            "source_dataset": "External",
            "scenario_id": "EXT_SCENE",
            "timestamp": "2026-06-16T10:00:00",
            "station_id": "EXT_BS_001",
            "rsrp": "-88",
            "sinr": "18",
            "fault_type_cn": "正常",
            "is_fault": "0",
        }
    ]

    first = import_external_network_data(
        network_metrics_content=csv_bytes(rows),
        network_metrics_filename="network_metrics.csv",
        source_name="unit",
        db_path=db_path,
    )
    second = import_external_network_data(
        network_metrics_content=csv_bytes(rows),
        network_metrics_filename="network_metrics.csv",
        source_name="unit",
        db_path=db_path,
    )

    assert first["tables"]["network_metrics"]["inserted_count"] == 1
    assert first["tables"]["network_metrics"]["skipped_count"] == 0
    assert second["tables"]["network_metrics"]["inserted_count"] == 0
    assert second["tables"]["network_metrics"]["skipped_count"] == 1


def test_external_import_records_bad_numeric_rows_and_imports_valid_rows(tmp_path: Path) -> None:
    processed_dir = tmp_path / "processed"
    db_path = tmp_path / "bad-row.db"
    generate_synthetic_processed_dataset(processed_dir, station_count=2, metric_count=10, fault_ratio=0.2, seed=8)
    initialize_database(db_path=db_path, processed_dir=processed_dir, reports_dir=REPORTS_DIR)
    rows = [
        {
            "metric_id": "EXT_GOOD",
            "source_dataset": "External",
            "scenario_id": "EXT_SCENE",
            "rsrp": "-90",
            "sinr": "12",
        },
        {
            "metric_id": "EXT_BAD",
            "source_dataset": "External",
            "scenario_id": "EXT_SCENE",
            "rsrp": "not-a-number",
            "sinr": "12",
        },
    ]

    result = import_external_network_data(
        network_metrics_content=csv_bytes(rows),
        network_metrics_filename="network_metrics.csv",
        source_name="unit",
        db_path=db_path,
    )

    assert result["tables"]["network_metrics"]["inserted_count"] == 1
    assert result["tables"]["network_metrics"]["error_count"] == 1
    with get_connection(db_path) as connection:
        errors = connection.execute("SELECT COUNT(*) AS count FROM data_import_errors").fetchone()["count"]
    assert errors == 1


def test_external_import_optional_base_stations_do_not_overwrite_existing(tmp_path: Path) -> None:
    processed_dir = tmp_path / "processed"
    db_path = tmp_path / "base.db"
    generate_synthetic_processed_dataset(processed_dir, station_count=2, metric_count=10, fault_ratio=0.2, seed=9)
    initialize_database(db_path=db_path, processed_dir=processed_dir, reports_dir=REPORTS_DIR)
    base_rows = [
        {
            "station_id": "EXT_BS_001",
            "source_dataset": "External",
            "gnodeb_id": "EXT_GNB",
            "cell_id": "1",
            "pci": "501",
            "longitude": "116.1",
            "latitude": "39.9",
            "height": "35",
            "azimuth": "90",
            "downtilt": "6",
            "tx_power": "43",
            "status": "normal",
        }
    ]
    metric_rows = [
        {
            "metric_id": "EXT_BASE_METRIC",
            "source_dataset": "External",
            "scenario_id": "EXT_SCENE",
            "station_id": "EXT_BS_001",
        }
    ]

    first = import_external_network_data(
        network_metrics_content=csv_bytes(metric_rows),
        network_metrics_filename="network_metrics.csv",
        source_name="unit",
        base_stations_content=csv_bytes(base_rows),
        base_stations_filename="base_stations.csv",
        db_path=db_path,
    )
    changed_base_rows = [{**base_rows[0], "tx_power": "99"}]
    second = import_external_network_data(
        network_metrics_content=csv_bytes(metric_rows),
        network_metrics_filename="network_metrics.csv",
        source_name="unit",
        base_stations_content=csv_bytes(changed_base_rows),
        base_stations_filename="base_stations.csv",
        db_path=db_path,
    )

    assert first["tables"]["base_stations"]["inserted_count"] == 1
    assert second["tables"]["base_stations"]["skipped_count"] == 1
    with get_connection(db_path) as connection:
        tx_power = connection.execute(
            "SELECT tx_power FROM base_stations WHERE station_id = 'EXT_BS_001'"
        ).fetchone()["tx_power"]
    assert tx_power == 43


def test_simulation_generate_and_import_apis(monkeypatch, tmp_path: Path) -> None:
    from backend.src.api.routes import simulation as simulation_route

    db_path = tmp_path / "api.db"
    processed_dir = tmp_path / "processed"

    def fake_refresh_demo_database(processed_dir=processed_dir, reports_dir=REPORTS_DIR, db_path=db_path):
        return refresh_demo_database(db_path=db_path, processed_dir=processed_dir, reports_dir=REPORTS_DIR)

    monkeypatch.setattr(simulation_route, "BACKEND_ROOT", tmp_path)
    monkeypatch.setattr(simulation_route, "refresh_demo_database", fake_refresh_demo_database)
    monkeypatch.setattr(simulation_route, "SIMULATION_IMPORT_DB_PATH", db_path)
    client = TestClient(create_app())

    generated = client.post("/api/simulation/generate?station_count=4&metric_count=3000&fault_ratio=0.2&seed=42")
    assert generated.status_code == 200
    generated_data = generated.json()["data"]
    assert generated_data["generated_files"]["network_metrics"] == 3000
    assert generated_data["refresh"]["database_refreshed"] is True

    import_rows = [
        {
            "metric_id": "API_EXT_M001",
            "source_dataset": "External",
            "scenario_id": "API_IMPORT",
            "rsrp": "-87",
            "sinr": "15",
        }
    ]
    imported = client.post(
        "/api/simulation/import",
        data={"source_name": "api-test", "batch_note": "unit"},
        files={"network_metrics": ("network_metrics.csv", csv_bytes(import_rows), "text/csv")},
    )

    assert imported.status_code == 200
    import_data = imported.json()["data"]
    assert import_data["tables"]["network_metrics"]["inserted_count"] == 1


def test_simulation_generate_preview_commits_only_after_confirmation(monkeypatch, tmp_path: Path) -> None:
    from backend.src.api.routes import simulation as simulation_route

    db_path = tmp_path / "preview.db"

    def fake_refresh_demo_database(processed_dir, reports_dir=REPORTS_DIR):
        return refresh_demo_database(db_path=db_path, processed_dir=processed_dir, reports_dir=reports_dir)

    monkeypatch.setattr(simulation_route, "BACKEND_ROOT", tmp_path)
    monkeypatch.setattr(simulation_route, "refresh_demo_database", fake_refresh_demo_database)
    client = TestClient(create_app())

    generated = client.post(
        "/api/simulation/generate"
        "?station_count=4&metric_count=3000&fault_ratio=0.2&seed=42&refresh_db=false"
    )
    assert generated.status_code == 200
    generated_data = generated.json()["data"]
    output_dir = Path(generated_data["output_dir"])
    preview_root = tmp_path / "data" / "generated_preview"

    assert generated_data["output_scope"] == "preview"
    assert generated_data["preview_id"]
    assert preview_root in output_dir.parents
    assert generated_data["generated_files"]["network_metrics"] == 3000
    assert "refresh" not in generated_data
    assert not (tmp_path / "data" / "processed" / "network_metrics.csv").exists()

    committed = client.post(f"/api/simulation/commit-preview?preview_id={generated_data['preview_id']}")
    assert committed.status_code == 200
    committed_data = committed.json()["data"]
    assert committed_data["database_refreshed"] is True
    assert committed_data["preview_id"] == generated_data["preview_id"]
    assert committed_data["after_counts"]["network_metrics"] == 3000
