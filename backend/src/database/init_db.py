from __future__ import annotations

import argparse
import csv
import json
from datetime import datetime
from pathlib import Path
from typing import Any

from backend.src.database.db import DATABASE_PATH, get_connection, initialize_schema
from backend.src.utils.config import PROCESSED_DIR, REPORTS_DIR


def to_float(value: Any) -> float | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


def insert_base_stations(connection, processed_dir: Path) -> None:
    rows = read_csv(processed_dir / "base_stations.csv")
    connection.executemany(
        """
        INSERT INTO base_stations (
          station_id, source_dataset, gnodeb_id, cell_id, pci, longitude, latitude,
          height, azimuth, downtilt, tx_power, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                row["station_id"],
                row["source_dataset"],
                row["gnodeb_id"],
                row["cell_id"],
                row["pci"],
                to_float(row["longitude"]),
                to_float(row["latitude"]),
                to_float(row["height"]),
                to_float(row["azimuth"]),
                to_float(row["downtilt"]),
                to_float(row["tx_power"]),
                row["status"],
            )
            for row in rows
        ],
    )


def insert_network_metrics(connection, processed_dir: Path) -> None:
    rows = read_csv(processed_dir / "network_metrics.csv")
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
                row["metric_id"],
                row["source_dataset"],
                row["scenario_id"],
                row["timestamp"],
                row["station_id"],
                row["cell_id"],
                to_float(row["longitude"]),
                to_float(row["latitude"]),
                to_float(row["rsrp"]),
                to_float(row["sinr"]),
                to_float(row["ber"]),
                to_float(row["bler_dl"]),
                to_float(row["bler_ul"]),
                to_float(row["bandwidth_usage"]),
                to_float(row["rb_num"]),
                to_float(row["throughput_mbps"]),
                to_float(row["traffic_bytes"]),
                to_float(row["packet_count"]),
                to_float(row["mcs"]),
                row["fault_type_raw"],
                row["fault_type_cn"],
                int(row["is_fault"] or 0),
            )
            for row in rows
        ],
    )


def insert_fault_logs(connection, processed_dir: Path) -> None:
    rows = read_csv(processed_dir / "fault_samples.csv")
    connection.executemany(
        """
        INSERT INTO fault_logs (
          fault_id, source_dataset, scenario_id, station_id, detected_at,
          fault_type_raw, fault_type_cn, fault_level, confidence, affected_kpis,
          fault_longitude, fault_latitude, truth_longitude, truth_latitude,
          localization_error_m, diagnosis_text, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                row["fault_id"],
                row["source_dataset"],
                row["scenario_id"],
                row["station_id"],
                row["start_time"],
                row["fault_type_raw"],
                row["fault_type_cn"],
                row["fault_level"],
                None,
                row["affected_kpis"],
                to_float(row["fault_longitude"]),
                to_float(row["fault_latitude"]),
                to_float(row["truth_longitude"]),
                to_float(row["truth_latitude"]),
                to_float(row["localization_error_m"]),
                row["diagnosis_text"],
                "未处理",
            )
            for row in rows
        ],
    )


def insert_diagnosis_records(connection, processed_dir: Path) -> None:
    rows = read_csv(processed_dir / "diagnosis_knowledge.csv")
    now = datetime.now().isoformat(timespec="seconds")
    connection.executemany(
        """
        INSERT INTO diagnosis_records (
          diagnosis_id, fault_id, fault_type_cn, root_cause, suggested_actions,
          affected_scope, review_required, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                row["knowledge_id"],
                None,
                row["fault_type_cn"],
                row["root_cause"],
                row["suggested_actions"],
                "",
                int(row["review_required"] or 0),
                now,
            )
            for row in rows
        ],
    )


def insert_model_evaluations(connection, reports_dir: Path) -> None:
    report = json.loads((reports_dir / "model_evaluation.json").read_text(encoding="utf-8"))
    now = datetime.now().isoformat(timespec="seconds")
    anomaly = report["anomaly_detection"]
    classification = report["fault_classification"]
    rows = [
        (
            "eval_anomaly_detection",
            "IsolationForest",
            "phase2",
            anomaly["accuracy"],
            anomaly["precision"],
            anomaly["recall"],
            anomaly["f1"],
            None,
            None,
            report["detection_latency_ms"],
            now,
        ),
        (
            "eval_fault_classification",
            "RandomForestClassifier",
            "phase2",
            classification["accuracy"],
            classification["precision_macro"],
            classification["recall_macro"],
            classification["f1_macro"],
            json.dumps(
                {
                    "labels": classification["labels"],
                    "matrix": classification["confusion_matrix"],
                },
                ensure_ascii=False,
            ),
            report["average_localization_error_m"],
            report["detection_latency_ms"],
            now,
        ),
    ]
    connection.executemany(
        """
        INSERT INTO model_evaluations (
          evaluation_id, model_name, dataset_version, accuracy, precision, recall,
          f1, confusion_matrix, localization_error_avg_m, detection_latency_ms, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )


def initialize_database(db_path: Path, processed_dir: Path, reports_dir: Path) -> None:
    initialize_schema(db_path)
    with get_connection(db_path) as connection:
        insert_base_stations(connection, processed_dir)
        insert_network_metrics(connection, processed_dir)
        insert_fault_logs(connection, processed_dir)
        insert_diagnosis_records(connection, processed_dir)
        insert_model_evaluations(connection, reports_dir)
        connection.commit()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Initialize SQLite database from phase-2 outputs.")
    parser.add_argument("--db-path", type=Path, default=DATABASE_PATH)
    parser.add_argument("--processed-dir", type=Path, default=PROCESSED_DIR)
    parser.add_argument("--reports-dir", type=Path, default=REPORTS_DIR)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    initialize_database(args.db_path, args.processed_dir, args.reports_dir)
    print(f"SQLite database initialized at {args.db_path}")


if __name__ == "__main__":
    main()
