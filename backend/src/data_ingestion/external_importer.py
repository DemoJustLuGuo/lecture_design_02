from __future__ import annotations

import csv
import io
import json
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from backend.src.data_ingestion.build_phase2_dataset import BASE_STATIONS_COLUMNS, NETWORK_METRICS_COLUMNS
from backend.src.database.db import DATABASE_PATH, get_connection


REQUIRED_NETWORK_COLUMNS = {"metric_id", "source_dataset", "scenario_id"}
NETWORK_NUMERIC_COLUMNS = {
    "longitude",
    "latitude",
    "rsrp",
    "sinr",
    "ber",
    "bler_dl",
    "bler_ul",
    "bandwidth_usage",
    "rb_num",
    "throughput_mbps",
    "traffic_bytes",
    "packet_count",
    "mcs",
}
BASE_NUMERIC_COLUMNS = {"longitude", "latitude", "height", "azimuth", "downtilt", "tx_power"}


def to_float(value: Any) -> float | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError as exc:
        raise ValueError(f"不是合法数值: {text}") from exc


def to_int(value: Any, default: int = 0) -> int:
    if value is None or str(value).strip() == "":
        return default
    try:
        return int(float(str(value).strip()))
    except ValueError as exc:
        raise ValueError(f"不是合法整数: {value}") from exc


def clean_text(value: Any, default: str = "") -> str:
    if value is None:
        return default
    text = str(value).strip()
    return text if text else default


def read_csv_bytes(content: bytes) -> list[dict[str, str]]:
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise ValueError("CSV缺少表头。")
    return list(reader)


def ensure_import_tables(connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS data_import_batches (
          batch_id TEXT PRIMARY KEY,
          source_name TEXT NOT NULL,
          batch_note TEXT,
          network_metrics_filename TEXT,
          base_stations_filename TEXT,
          started_at TEXT NOT NULL,
          finished_at TEXT,
          inserted_count INTEGER DEFAULT 0,
          skipped_count INTEGER DEFAULT 0,
          error_count INTEGER DEFAULT 0,
          status TEXT NOT NULL
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS data_import_errors (
          error_id TEXT PRIMARY KEY,
          batch_id TEXT NOT NULL,
          table_name TEXT NOT NULL,
          row_number INTEGER,
          error_reason TEXT NOT NULL,
          raw_row TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (batch_id) REFERENCES data_import_batches(batch_id)
        )
        """
    )
    connection.execute("CREATE INDEX IF NOT EXISTS idx_data_import_errors_batch ON data_import_errors(batch_id)")


def normalize_network_row(row: dict[str, Any]) -> dict[str, Any]:
    missing = [column for column in REQUIRED_NETWORK_COLUMNS if not clean_text(row.get(column))]
    if missing:
        raise ValueError(f"缺少必填字段: {', '.join(missing)}")

    normalized: dict[str, Any] = {column: clean_text(row.get(column)) for column in NETWORK_METRICS_COLUMNS}
    for column in NETWORK_NUMERIC_COLUMNS:
        normalized[column] = to_float(row.get(column))
    normalized["fault_type_cn"] = clean_text(row.get("fault_type_cn"), "未知")
    normalized["fault_type_raw"] = clean_text(row.get("fault_type_raw"), normalized["fault_type_cn"])
    normalized["is_fault"] = to_int(row.get("is_fault"), 0)
    return normalized


def normalize_base_station_row(row: dict[str, Any]) -> dict[str, Any]:
    station_id = clean_text(row.get("station_id"))
    source_dataset = clean_text(row.get("source_dataset"))
    if not station_id or not source_dataset:
        raise ValueError("缺少必填字段: station_id, source_dataset")

    normalized: dict[str, Any] = {column: clean_text(row.get(column)) for column in BASE_STATIONS_COLUMNS}
    for column in BASE_NUMERIC_COLUMNS:
        normalized[column] = to_float(row.get(column))
    normalized["status"] = clean_text(row.get("status"), "normal")
    return normalized


def insert_error(
    connection,
    batch_id: str,
    table_name: str,
    row_number: int,
    error_reason: str,
    raw_row: dict[str, Any],
    now: str,
) -> None:
    connection.execute(
        """
        INSERT INTO data_import_errors (
          error_id, batch_id, table_name, row_number, error_reason, raw_row, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            f"ERR_{batch_id}_{table_name}_{row_number}_{uuid4().hex[:8]}",
            batch_id,
            table_name,
            row_number,
            error_reason,
            json.dumps(raw_row, ensure_ascii=False),
            now,
        ),
    )


def append_base_stations(connection, rows: list[dict[str, str]], batch_id: str, now: str) -> dict[str, int]:
    inserted = 0
    skipped = 0
    errors = 0
    sql = f"""
        INSERT OR IGNORE INTO base_stations ({", ".join(BASE_STATIONS_COLUMNS)})
        VALUES ({", ".join("?" for _ in BASE_STATIONS_COLUMNS)})
    """
    for row_number, row in enumerate(rows, start=2):
        try:
            normalized = normalize_base_station_row(row)
            cursor = connection.execute(sql, [normalized[column] for column in BASE_STATIONS_COLUMNS])
            if cursor.rowcount == 1:
                inserted += 1
            else:
                skipped += 1
        except ValueError as exc:
            errors += 1
            insert_error(connection, batch_id, "base_stations", row_number, str(exc), row, now)
    return {"inserted_count": inserted, "skipped_count": skipped, "error_count": errors}


def append_network_metrics(connection, rows: list[dict[str, str]], batch_id: str, now: str) -> dict[str, int]:
    inserted = 0
    skipped = 0
    errors = 0
    sql = f"""
        INSERT OR IGNORE INTO network_metrics ({", ".join(NETWORK_METRICS_COLUMNS)})
        VALUES ({", ".join("?" for _ in NETWORK_METRICS_COLUMNS)})
    """
    for row_number, row in enumerate(rows, start=2):
        try:
            normalized = normalize_network_row(row)
            cursor = connection.execute(sql, [normalized[column] for column in NETWORK_METRICS_COLUMNS])
            if cursor.rowcount == 1:
                inserted += 1
            else:
                skipped += 1
        except ValueError as exc:
            errors += 1
            insert_error(connection, batch_id, "network_metrics", row_number, str(exc), row, now)
    return {"inserted_count": inserted, "skipped_count": skipped, "error_count": errors}


def import_external_network_data(
    network_metrics_content: bytes,
    network_metrics_filename: str,
    source_name: str,
    batch_note: str = "",
    base_stations_content: bytes | None = None,
    base_stations_filename: str | None = None,
    db_path: Path = DATABASE_PATH,
) -> dict[str, Any]:
    started_at = datetime.now().isoformat(timespec="seconds")
    batch_id = f"IMP_{datetime.now().strftime('%Y%m%d%H%M%S')}_{uuid4().hex[:8]}"
    source = clean_text(source_name, "external_upload")

    network_rows = read_csv_bytes(network_metrics_content)
    network_columns = set(network_rows[0].keys()) if network_rows else set()
    missing_network_columns = sorted(REQUIRED_NETWORK_COLUMNS - network_columns)
    if missing_network_columns:
        raise ValueError(f"network_metrics CSV缺少必填列: {', '.join(missing_network_columns)}")

    base_rows: list[dict[str, str]] = []
    if base_stations_content:
        base_rows = read_csv_bytes(base_stations_content)

    with get_connection(db_path) as connection:
        ensure_import_tables(connection)
        connection.execute(
            """
            INSERT INTO data_import_batches (
              batch_id, source_name, batch_note, network_metrics_filename,
              base_stations_filename, started_at, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                batch_id,
                source,
                batch_note,
                network_metrics_filename,
                base_stations_filename,
                started_at,
                "running",
            ),
        )
        base_result = append_base_stations(connection, base_rows, batch_id, started_at) if base_rows else {
            "inserted_count": 0,
            "skipped_count": 0,
            "error_count": 0,
        }
        metrics_result = append_network_metrics(connection, network_rows, batch_id, started_at)
        inserted_count = base_result["inserted_count"] + metrics_result["inserted_count"]
        skipped_count = base_result["skipped_count"] + metrics_result["skipped_count"]
        error_count = base_result["error_count"] + metrics_result["error_count"]
        status = "completed_with_errors" if error_count else "completed"
        finished_at = datetime.now().isoformat(timespec="seconds")
        connection.execute(
            """
            UPDATE data_import_batches
            SET finished_at = ?, inserted_count = ?, skipped_count = ?,
                error_count = ?, status = ?
            WHERE batch_id = ?
            """,
            (finished_at, inserted_count, skipped_count, error_count, status, batch_id),
        )
        connection.commit()

    return {
        "batch_id": batch_id,
        "source_name": source,
        "status": status,
        "started_at": started_at,
        "finished_at": finished_at,
        "network_metrics_filename": network_metrics_filename,
        "base_stations_filename": base_stations_filename,
        "tables": {
            "base_stations": base_result,
            "network_metrics": metrics_result,
        },
        "inserted_count": inserted_count,
        "skipped_count": skipped_count,
        "error_count": error_count,
        "message": "外部网络数据已按追加模式导入，重复主键已跳过。",
    }
