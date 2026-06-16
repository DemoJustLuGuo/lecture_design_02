from __future__ import annotations

from pathlib import Path

from backend.src.data_ingestion.demo_loader import PROCESSED_DIR, REPORTS_DIR, refresh_demo_database


def test_refresh_demo_database_loads_processed_data_into_temp_sqlite(tmp_path: Path) -> None:
    db_path = tmp_path / "demo.db"

    result = refresh_demo_database(
        db_path=db_path,
        processed_dir=PROCESSED_DIR,
        reports_dir=REPORTS_DIR,
    )

    assert result["processed_data_available"] is True
    assert result["database_refreshed"] is True
    assert result["missing_files"] == []
    assert result["before_counts"] == {}
    assert result["after_counts"]["base_stations"] > 0
    assert result["after_counts"]["network_metrics"] >= 3000
    assert result["after_counts"]["fault_logs"] > 0
    assert result["loaded_files"]["network_metrics"] >= 3000
    assert result["fault_type_counts"]
    assert result["source_summary"]["total_metric_rows"] >= 3000
