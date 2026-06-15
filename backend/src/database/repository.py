from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from backend.src.database.db import DATABASE_PATH, get_connection


def row_to_dict(row) -> dict[str, Any]:
    return dict(row) if row is not None else {}


class Repository:
    def __init__(self, db_path: Path = DATABASE_PATH):
        self.db_path = db_path

    def dashboard_summary(self) -> dict[str, Any]:
        with get_connection(self.db_path) as connection:
            station_count = connection.execute("SELECT COUNT(*) AS count FROM base_stations").fetchone()["count"]
            fault_count = connection.execute("SELECT COUNT(*) AS count FROM fault_logs WHERE fault_type_cn <> '正常'").fetchone()["count"]
            severe_count = connection.execute("SELECT COUNT(*) AS count FROM fault_logs WHERE fault_level = '严重'").fetchone()["count"]
            latest_eval = connection.execute(
                """
                SELECT accuracy, f1, detection_latency_ms
                FROM model_evaluations
                WHERE model_name = 'RandomForestClassifier'
                LIMIT 1
                """
            ).fetchone()
            type_rows = connection.execute(
                """
                SELECT fault_type_cn, COUNT(*) AS count
                FROM fault_logs
                GROUP BY fault_type_cn
                ORDER BY count DESC
                """
            ).fetchall()
        return {
            "station_count": station_count,
            "fault_count": fault_count,
            "severe_fault_count": severe_count,
            "classification_accuracy": latest_eval["accuracy"] if latest_eval else None,
            "classification_f1": latest_eval["f1"] if latest_eval else None,
            "detection_latency_ms": latest_eval["detection_latency_ms"] if latest_eval else None,
            "fault_type_counts": [row_to_dict(row) for row in type_rows],
        }

    def list_stations(self, limit: int = 200) -> list[dict[str, Any]]:
        with get_connection(self.db_path) as connection:
            rows = connection.execute(
                """
                SELECT station_id, source_dataset, gnodeb_id, cell_id, pci, longitude,
                       latitude, height, azimuth, downtilt, tx_power, status
                FROM base_stations
                ORDER BY station_id
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [row_to_dict(row) for row in rows]

    def get_station(self, station_id: str) -> dict[str, Any] | None:
        with get_connection(self.db_path) as connection:
            station = connection.execute(
                "SELECT * FROM base_stations WHERE station_id = ?",
                (station_id,),
            ).fetchone()
            if station is None:
                return None
            metrics = connection.execute(
                """
                SELECT timestamp, rsrp, sinr, ber, bandwidth_usage, rb_num,
                       throughput_mbps, fault_type_cn, is_fault
                FROM network_metrics
                WHERE station_id = ?
                ORDER BY timestamp
                LIMIT 100
                """,
                (station_id,),
            ).fetchall()
        data = row_to_dict(station)
        data["recent_metrics"] = [row_to_dict(row) for row in metrics]
        return data

    def realtime_metrics(self, limit: int = 200) -> list[dict[str, Any]]:
        with get_connection(self.db_path) as connection:
            rows = connection.execute(
                """
                SELECT metric_id, source_dataset, scenario_id, timestamp, station_id,
                       longitude, latitude, rsrp, sinr, ber, bandwidth_usage,
                       rb_num, throughput_mbps, fault_type_cn, is_fault
                FROM network_metrics
                ORDER BY metric_id DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [row_to_dict(row) for row in rows]

    def inference_metrics(
        self,
        limit: int = 20,
        metric_id: str | None = None,
        source_dataset: str | None = "TelecomTS",
    ) -> list[dict[str, Any]]:
        sql = """
            SELECT metric_id, source_dataset, scenario_id, timestamp, station_id,
                   cell_id, longitude, latitude, rsrp, sinr, ber, bler_dl, bler_ul,
                   bandwidth_usage, rb_num, throughput_mbps, traffic_bytes,
                   packet_count, mcs, fault_type_raw, fault_type_cn, is_fault
            FROM network_metrics
        """
        params: list[Any] = []
        conditions: list[str] = []
        if metric_id:
            conditions.append("metric_id = ?")
            params.append(metric_id)
        elif source_dataset:
            conditions.append("source_dataset = ?")
            params.append(source_dataset)
        if conditions:
            sql += " WHERE " + " AND ".join(conditions)
        sql += " ORDER BY metric_id DESC LIMIT ?"
        params.append(limit)

        with get_connection(self.db_path) as connection:
            rows = connection.execute(sql, params).fetchall()
        return [row_to_dict(row) for row in rows]

    def list_faults(
        self,
        fault_type: str | None = None,
        fault_level: str | None = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        sql = """
            SELECT fault_id, source_dataset, scenario_id, station_id, detected_at,
                   fault_type_raw, fault_type_cn, fault_level, confidence,
                   fault_longitude, fault_latitude, localization_error_m, status
            FROM fault_logs
            WHERE fault_type_cn <> '正常'
        """
        params: list[Any] = []
        if fault_type:
            sql += " AND fault_type_cn = ?"
            params.append(fault_type)
        if fault_level:
            sql += " AND fault_level = ?"
            params.append(fault_level)
        sql += " ORDER BY detected_at DESC LIMIT ?"
        params.append(limit)
        with get_connection(self.db_path) as connection:
            rows = connection.execute(sql, params).fetchall()
        return [row_to_dict(row) for row in rows]

    def get_fault(self, fault_id: str) -> dict[str, Any] | None:
        with get_connection(self.db_path) as connection:
            fault = connection.execute("SELECT * FROM fault_logs WHERE fault_id = ?", (fault_id,)).fetchone()
        return row_to_dict(fault) if fault else None

    def diagnosis_for_fault(self, fault_id: str) -> dict[str, Any] | None:
        fault = self.get_fault(fault_id)
        if not fault:
            return None
        with get_connection(self.db_path) as connection:
            diagnosis = connection.execute(
                """
                SELECT *
                FROM diagnosis_records
                WHERE fault_type_cn = ?
                ORDER BY review_required DESC
                LIMIT 1
                """,
                (fault["fault_type_cn"],),
            ).fetchone()
        data = row_to_dict(diagnosis) if diagnosis else {}
        data["fault"] = fault
        if not data.get("suggested_actions"):
            data["suggested_actions"] = fault.get("diagnosis_text") or ""
        return data

    def model_evaluation(self) -> dict[str, Any]:
        with get_connection(self.db_path) as connection:
            rows = connection.execute("SELECT * FROM model_evaluations ORDER BY model_name").fetchall()
        evaluations = []
        for row in rows:
            item = row_to_dict(row)
            if item.get("confusion_matrix"):
                item["confusion_matrix"] = json.loads(item["confusion_matrix"])
            evaluations.append(item)
        return {"evaluations": evaluations}
