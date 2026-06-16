from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from backend.src.diagnosis.rules import (
    build_diagnosis_display,
    diagnosis_template_for_fault_type,
    is_chinese_text,
)
from backend.src.database.db import DATABASE_PATH, get_connection


LOW_CONFIDENCE_THRESHOLD = 0.8
ONLINE_FAULT_LEVEL = "一般"
UNCLASSIFIED_ANOMALY = "未分类异常"
FAULT_STATUS_TRANSITIONS = {
    "未处理": {"处理中"},
    "处理中": {"已处理", "关闭"},
    "已处理": set(),
    "关闭": set(),
}
VALID_FAULT_STATUSES = set(FAULT_STATUS_TRANSITIONS)


def row_to_dict(row) -> dict[str, Any]:
    return dict(row) if row is not None else {}


def as_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


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

    def fault_trend(self, days: int = 7) -> dict[str, Any]:
        safe_days = max(1, min(days, 30))
        with get_connection(self.db_path) as connection:
            latest_row = connection.execute(
                """
                SELECT MAX(date(detected_at)) AS latest_date
                FROM fault_logs
                WHERE fault_type_cn <> '正常' AND detected_at IS NOT NULL
                """
            ).fetchone()
            latest_text = latest_row["latest_date"] if latest_row else None
            latest_date = date.fromisoformat(latest_text) if latest_text else date.today()
            start_date = latest_date - timedelta(days=safe_days - 1)
            rows = connection.execute(
                """
                SELECT date(detected_at) AS date, COUNT(*) AS total,
                       SUM(CASE WHEN fault_level = '严重' THEN 1 ELSE 0 END) AS severe
                FROM fault_logs
                WHERE fault_type_cn <> '正常'
                  AND detected_at IS NOT NULL
                  AND date(detected_at) BETWEEN ? AND ?
                GROUP BY date(detected_at)
                ORDER BY date(detected_at)
                """,
                (start_date.isoformat(), latest_date.isoformat()),
            ).fetchall()

        by_date = {
            row["date"]: {
                "date": row["date"],
                "label": row["date"][5:],
                "total": int(row["total"] or 0),
                "severe": int(row["severe"] or 0),
            }
            for row in rows
        }
        items = []
        for index in range(safe_days):
            current = start_date + timedelta(days=index)
            current_text = current.isoformat()
            items.append(
                by_date.get(
                    current_text,
                    {
                        "date": current_text,
                        "label": current_text[5:],
                        "total": 0,
                        "severe": 0,
                    },
                )
            )
        return {
            "days": safe_days,
            "start_date": start_date.isoformat(),
            "end_date": latest_date.isoformat(),
            "items": items,
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
                FROM (
                  SELECT timestamp, rsrp, sinr, ber, bandwidth_usage, rb_num,
                         throughput_mbps, fault_type_cn, is_fault
                  FROM network_metrics
                  WHERE station_id = ?
                  ORDER BY timestamp DESC
                  LIMIT 100
                )
                ORDER BY timestamp
                """,
                (station_id,),
            ).fetchall()
            faults = connection.execute(
                """
                SELECT fault_id, source_dataset, scenario_id, station_id, detected_at,
                       fault_type_raw, fault_type_cn, fault_level, confidence,
                       fault_longitude, fault_latitude, localization_error_m, status
                FROM fault_logs
                WHERE station_id = ? AND fault_type_cn <> '正常'
                ORDER BY detected_at DESC
                LIMIT 10
                """,
                (station_id,),
            ).fetchall()
        data = row_to_dict(station)
        data["recent_metrics"] = [row_to_dict(row) for row in metrics]
        data["recent_faults"] = [row_to_dict(row) for row in faults]
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
        status: str | None = None,
        source: str | None = None,
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
        if status:
            sql += " AND status = ?"
            params.append(status)
        if source == "ai":
            sql += " AND fault_id LIKE 'AI_%'"
        elif source == "history":
            sql += " AND fault_id NOT LIKE 'AI_%'"
        sql += " ORDER BY detected_at DESC LIMIT ?"
        params.append(limit)
        with get_connection(self.db_path) as connection:
            rows = connection.execute(sql, params).fetchall()
        return [row_to_dict(row) for row in rows]

    def get_fault(self, fault_id: str) -> dict[str, Any] | None:
        with get_connection(self.db_path) as connection:
            fault = connection.execute("SELECT * FROM fault_logs WHERE fault_id = ?", (fault_id,)).fetchone()
        return row_to_dict(fault) if fault else None

    def update_fault_status(self, fault_id: str, status: str) -> dict[str, Any] | None:
        if status not in VALID_FAULT_STATUSES:
            raise ValueError(f"不支持的故障处理状态：{status}")

        with get_connection(self.db_path) as connection:
            current_row = connection.execute(
                "SELECT status FROM fault_logs WHERE fault_id = ?",
                (fault_id,),
            ).fetchone()
            if current_row is None:
                return None

            current_status = current_row["status"] or "未处理"
            if current_status == status:
                updated = connection.execute(
                    "SELECT * FROM fault_logs WHERE fault_id = ?",
                    (fault_id,),
                ).fetchone()
                return row_to_dict(updated)

            if status not in FAULT_STATUS_TRANSITIONS.get(current_status, set()):
                raise ValueError(f"非法状态流转：{current_status} -> {status}")

            connection.execute(
                "UPDATE fault_logs SET status = ? WHERE fault_id = ?",
                (status, fault_id),
            )
            connection.commit()
            updated = connection.execute(
                "SELECT * FROM fault_logs WHERE fault_id = ?",
                (fault_id,),
            ).fetchone()
        return row_to_dict(updated)

    def diagnosis_for_fault(self, fault_id: str) -> dict[str, Any] | None:
        fault = self.get_fault(fault_id)
        if not fault:
            return None
        with get_connection(self.db_path) as connection:
            diagnosis = connection.execute(
                """
                SELECT *
                FROM diagnosis_records
                WHERE fault_id = ? OR (fault_id IS NULL AND fault_type_cn = ?)
                ORDER BY
                  CASE WHEN fault_id = ? THEN 0 ELSE 1 END,
                  review_required DESC
                LIMIT 1
                """,
                (fault_id, fault["fault_type_cn"], fault_id),
            ).fetchone()
        data = row_to_dict(diagnosis) if diagnosis else {}
        data["fault"] = fault
        if not data.get("root_cause") or not is_chinese_text(data.get("root_cause")):
            data["root_cause"] = diagnosis_template_for_fault_type(fault.get("fault_type_cn"))["root_cause"]
        if not data.get("suggested_actions"):
            data["suggested_actions"] = fault.get("diagnosis_text") or ""
        if not data.get("suggested_actions") or not is_chinese_text(data.get("suggested_actions")):
            data["suggested_actions"] = diagnosis_template_for_fault_type(fault.get("fault_type_cn"))["suggested_actions"]
        if not data.get("affected_scope") or not is_chinese_text(data.get("affected_scope")):
            data["affected_scope"] = diagnosis_template_for_fault_type(fault.get("fault_type_cn"))["affected_scope"]
        data["display"] = build_diagnosis_display(fault, data)
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

    def _diagnosis_template(self, connection, fault_type_cn: str) -> dict[str, Any]:
        row = connection.execute(
            """
            SELECT root_cause, suggested_actions, affected_scope, review_required
            FROM diagnosis_records
            WHERE fault_id IS NULL AND fault_type_cn = ?
            ORDER BY review_required DESC
            LIMIT 1
            """,
            (fault_type_cn,),
        ).fetchone()
        template = diagnosis_template_for_fault_type(fault_type_cn)
        if not row:
            return template
        data = row_to_dict(row)
        if not data.get("root_cause") or not is_chinese_text(data.get("root_cause")):
            data["root_cause"] = template["root_cause"]
        if not data.get("suggested_actions") or not is_chinese_text(data.get("suggested_actions")):
            data["suggested_actions"] = template["suggested_actions"]
        if not data.get("affected_scope") or not is_chinese_text(data.get("affected_scope")):
            data["affected_scope"] = template["affected_scope"]
        return data

    def _existing_fault(self, connection, fault_id: str) -> dict[str, Any] | None:
        row = connection.execute("SELECT fault_id, fault_type_cn FROM fault_logs WHERE fault_id = ?", (fault_id,)).fetchone()
        return row_to_dict(row) if row else None

    def persist_inference_results(
        self,
        records: list[dict[str, Any]],
        predictions: list[dict[str, Any]],
        mode: str,
    ) -> dict[str, Any]:
        records_by_metric = {str(record.get("metric_id")): record for record in records if record.get("metric_id")}
        now = datetime.now().isoformat(timespec="seconds")
        persisted_fault_ids: list[str] = []
        skipped_count = 0

        with get_connection(self.db_path) as connection:
            for prediction in predictions:
                metric_id = prediction.get("metric_id")
                if not metric_id:
                    skipped_count += 1
                    continue

                record = records_by_metric.get(str(metric_id), {})
                fault_id = f"AI_{metric_id}"
                confidence: float | None = None

                if mode == "classification":
                    fault_type_cn = str(prediction.get("predicted_fault_type") or "")
                    if not fault_type_cn or fault_type_cn == "正常":
                        skipped_count += 1
                        continue
                    confidence = as_float(prediction.get("confidence"))
                    fault_type_raw = "AI fault classification"
                elif mode == "detection":
                    if not prediction.get("is_anomaly"):
                        skipped_count += 1
                        continue
                    existing = self._existing_fault(connection, fault_id)
                    if existing and existing.get("fault_type_cn") != UNCLASSIFIED_ANOMALY:
                        skipped_count += 1
                        continue
                    fault_type_cn = UNCLASSIFIED_ANOMALY
                    fault_type_raw = "AI anomaly detection"
                else:
                    raise ValueError(f"unsupported inference persistence mode: {mode}")

                template = self._diagnosis_template(connection, fault_type_cn)
                review_required = int(template.get("review_required") or 0)
                if fault_type_cn == UNCLASSIFIED_ANOMALY or confidence is None or confidence < LOW_CONFIDENCE_THRESHOLD:
                    review_required = 1

                key_metrics = prediction.get("key_metrics") or {}
                affected_kpis = ";".join(str(key) for key in key_metrics.keys())
                source_dataset = record.get("source_dataset") or prediction.get("source_dataset") or "online_inference"
                scenario_id = record.get("scenario_id") or prediction.get("scenario_id") or "online_inference"
                station_id = record.get("station_id") or prediction.get("station_id")
                root_cause = template.get("root_cause") or "AI模型检测到通信指标异常。"
                suggested_actions = template.get("suggested_actions") or "请结合关键指标和现场告警进行人工复核。"
                affected_scope = template.get("affected_scope") or f"影响基站 {station_id or '未知基站'} 附近采样点。"
                diagnosis_text = f"原因：{root_cause} 建议：{suggested_actions}"

                connection.execute(
                    """
                    INSERT INTO fault_logs (
                      fault_id, source_dataset, scenario_id, station_id, detected_at,
                      fault_type_raw, fault_type_cn, fault_level, confidence, affected_kpis,
                      fault_longitude, fault_latitude, truth_longitude, truth_latitude,
                      localization_error_m, diagnosis_text, status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(fault_id) DO UPDATE SET
                      source_dataset = excluded.source_dataset,
                      scenario_id = excluded.scenario_id,
                      station_id = excluded.station_id,
                      detected_at = excluded.detected_at,
                      fault_type_raw = excluded.fault_type_raw,
                      fault_type_cn = excluded.fault_type_cn,
                      fault_level = excluded.fault_level,
                      confidence = excluded.confidence,
                      affected_kpis = excluded.affected_kpis,
                      fault_longitude = excluded.fault_longitude,
                      fault_latitude = excluded.fault_latitude,
                      diagnosis_text = excluded.diagnosis_text,
                      status = COALESCE(fault_logs.status, excluded.status)
                    """,
                    (
                        fault_id,
                        source_dataset,
                        scenario_id,
                        station_id,
                        now,
                        fault_type_raw,
                        fault_type_cn,
                        ONLINE_FAULT_LEVEL,
                        confidence,
                        affected_kpis,
                        as_float(record.get("longitude")),
                        as_float(record.get("latitude")),
                        None,
                        None,
                        None,
                        diagnosis_text,
                        "未处理",
                    ),
                )
                connection.execute(
                    """
                    INSERT INTO diagnosis_records (
                      diagnosis_id, fault_id, fault_type_cn, root_cause, suggested_actions,
                      affected_scope, review_required, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(diagnosis_id) DO UPDATE SET
                      fault_type_cn = excluded.fault_type_cn,
                      root_cause = excluded.root_cause,
                      suggested_actions = excluded.suggested_actions,
                      affected_scope = excluded.affected_scope,
                      review_required = excluded.review_required,
                      created_at = excluded.created_at
                    """,
                    (
                        f"DIA_{fault_id}",
                        fault_id,
                        fault_type_cn,
                        root_cause,
                        suggested_actions,
                        affected_scope,
                        review_required,
                        now,
                    ),
                )
                persisted_fault_ids.append(fault_id)

            connection.commit()

        return {
            "enabled": True,
            "persisted_count": len(persisted_fault_ids),
            "skipped_count": skipped_count,
            "fault_ids": persisted_fault_ids,
        }
