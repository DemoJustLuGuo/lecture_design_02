from __future__ import annotations

import csv
import json
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any

from backend.src.database.db import BACKEND_ROOT, DATABASE_PATH, get_connection
from backend.src.database.init_db import initialize_database


PROCESSED_DIR = BACKEND_ROOT / "data" / "processed"
REPORTS_DIR = BACKEND_ROOT / "reports"
REQUIRED_PROCESSED_FILES = {
    "network_metrics.csv",
    "fault_samples.csv",
    "diagnosis_knowledge.csv",
    "base_stations.csv",
    "location_samples.csv",
    "root_cause_samples.csv",
    "dataset_manifest.json",
}
DATABASE_TABLES = [
    "base_stations",
    "network_metrics",
    "fault_logs",
    "diagnosis_records",
    "model_evaluations",
]


def count_csv_rows(path: Path) -> int:
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        return max(sum(1 for _ in file) - 1, 0)


def count_csv_by_column(path: Path, column: str) -> dict[str, int]:
    counts: Counter[str] = Counter()
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        for row in csv.DictReader(file):
            counts[row.get(column) or "未知"] += 1
    return dict(counts.most_common())


def validate_demo_inputs(processed_dir: Path, reports_dir: Path) -> list[str]:
    missing = [name for name in sorted(REQUIRED_PROCESSED_FILES) if not (processed_dir / name).exists()]
    if not (reports_dir / "model_evaluation.json").exists():
        missing.append("reports/model_evaluation.json")
    return missing


def table_counts(db_path: Path) -> dict[str, int]:
    with get_connection(db_path) as connection:
        return {
            table: int(connection.execute(f"SELECT COUNT(*) AS count FROM {table}").fetchone()["count"])
            for table in DATABASE_TABLES
        }


def current_fault_type_counts(db_path: Path) -> dict[str, int]:
    with get_connection(db_path) as connection:
        rows = connection.execute(
            """
            SELECT fault_type_cn, COUNT(*) AS count
            FROM fault_logs
            WHERE fault_type_cn <> '正常'
            GROUP BY fault_type_cn
            ORDER BY count DESC
            """
        ).fetchall()
    return {row["fault_type_cn"]: int(row["count"]) for row in rows}


def load_manifest(processed_dir: Path) -> dict[str, Any]:
    manifest_path = processed_dir / "dataset_manifest.json"
    if not manifest_path.exists():
        return {}
    return json.loads(manifest_path.read_text(encoding="utf-8"))


def demo_source_summary(processed_dir: Path) -> dict[str, Any]:
    manifest = load_manifest(processed_dir)
    return {
        "manifest_generated_at": manifest.get("generated_at"),
        "source_datasets": manifest.get("source_datasets", {}),
        "total_metric_rows": manifest.get("total_metric_rows"),
    }


def processed_file_summary(processed_dir: Path) -> dict[str, int]:
    summary = {
        "base_stations": count_csv_rows(processed_dir / "base_stations.csv"),
        "network_metrics": count_csv_rows(processed_dir / "network_metrics.csv"),
        "fault_samples": count_csv_rows(processed_dir / "fault_samples.csv"),
        "diagnosis_knowledge": count_csv_rows(processed_dir / "diagnosis_knowledge.csv"),
        "location_samples": count_csv_rows(processed_dir / "location_samples.csv"),
        "root_cause_samples": count_csv_rows(processed_dir / "root_cause_samples.csv"),
    }
    triangulation_path = processed_dir / "triangulation_observations.csv"
    if triangulation_path.exists():
        summary["triangulation_observations"] = count_csv_rows(triangulation_path)
    return summary


def refresh_demo_database(
    db_path: Path = DATABASE_PATH,
    processed_dir: Path = PROCESSED_DIR,
    reports_dir: Path = REPORTS_DIR,
) -> dict[str, Any]:
    missing = validate_demo_inputs(processed_dir, reports_dir)
    if missing:
        return {
            "processed_data_available": False,
            "database_refreshed": False,
            "processed_dir": str(processed_dir),
            "database_path": str(db_path),
            "missing_files": missing,
            "message": "演示数据文件不完整，无法刷新SQLite演示库。",
        }

    started_at = datetime.now()
    before_counts = table_counts(db_path) if db_path.exists() else {}
    initialize_database(db_path=db_path, processed_dir=processed_dir, reports_dir=reports_dir)
    after_counts = table_counts(db_path)
    finished_at = datetime.now()

    return {
        "processed_data_available": True,
        "database_refreshed": True,
        "mode": "reload_demo_dataset",
        "processed_dir": str(processed_dir),
        "database_path": str(db_path),
        "started_at": started_at.isoformat(timespec="seconds"),
        "finished_at": finished_at.isoformat(timespec="seconds"),
        "duration_ms": round((finished_at - started_at).total_seconds() * 1000, 2),
        "before_counts": before_counts,
        "after_counts": after_counts,
        "loaded_files": processed_file_summary(processed_dir),
        "fault_type_counts": current_fault_type_counts(db_path),
        "processed_fault_type_counts": count_csv_by_column(processed_dir / "fault_samples.csv", "fault_type_cn"),
        "source_summary": demo_source_summary(processed_dir),
        "missing_files": [],
        "message": "演示数据已重新加载到SQLite，基站、指标、故障日志、诊断知识和模型评估已刷新。",
    }
