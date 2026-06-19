"""Build phase-2 normalized tables from TelecomTS and Kaggle 5G datasets."""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from statistics import mean
from typing import Any


NETWORK_METRICS_COLUMNS = [
    "metric_id",
    "source_dataset",
    "scenario_id",
    "timestamp",
    "station_id",
    "cell_id",
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
    "fault_type_raw",
    "fault_type_cn",
    "is_fault",
]

FAULT_SAMPLES_COLUMNS = [
    "fault_id",
    "source_dataset",
    "scenario_id",
    "fault_type_raw",
    "fault_type_cn",
    "fault_level",
    "affected_kpis",
    "start_time",
    "end_time",
    "station_id",
    "fault_longitude",
    "fault_latitude",
    "truth_longitude",
    "truth_latitude",
    "localization_error_m",
    "diagnosis_text",
]

DIAGNOSIS_COLUMNS = [
    "knowledge_id",
    "source_dataset",
    "fault_type_raw",
    "fault_type_cn",
    "root_cause",
    "suggested_actions",
    "review_required",
]

BASE_STATIONS_COLUMNS = [
    "station_id",
    "source_dataset",
    "gnodeb_id",
    "cell_id",
    "pci",
    "longitude",
    "latitude",
    "height",
    "azimuth",
    "downtilt",
    "tx_power",
    "status",
]

LOCATION_COLUMNS = [
    "location_sample_id",
    "scenario_id",
    "timestamp",
    "longitude",
    "latitude",
    "serving_pci",
    "rsrp",
    "sinr",
    "throughput_mbps",
    "rb_num",
    "gps_speed_kmh",
    "nearest_station_id",
    "nearest_station_distance_m",
    "root_cause",
    "fault_type_cn",
]

ROOT_CAUSE_COLUMNS = [
    "root_cause_id",
    "scenario_id",
    "answer",
    "fault_type_cn",
    "root_cause_description",
    "suggested_action",
    "mean_rsrp",
    "mean_sinr",
    "mean_throughput_mbps",
    "mean_rb_num",
    "mean_gps_speed_kmh",
]

KAGGLE_CAUSES = {
    "C1": "服务小区下倾角过大，远端弱覆盖",
    "C2": "服务小区覆盖距离超过 1 km，越区覆盖",
    "C3": "邻区提供更高吞吐",
    "C4": "非共站同频邻区导致严重重叠覆盖",
    "C5": "频繁切换降低性能",
    "C6": "邻区和服务小区 PCI mod 30 相同导致干扰",
    "C7": "车速超过 40 km/h 影响吞吐",
    "C8": "平均调度 RB 低于 160 影响吞吐",
}

KAGGLE_ACTIONS = {
    "C1": "复核服务小区下倾角，优化远端覆盖。",
    "C2": "检查越区覆盖，调整功率、方位角或切换边界。",
    "C3": "优化邻区关系和切换策略，降低强邻区抢占影响。",
    "C4": "处理同频重叠覆盖，优化频点、功率和覆盖边界。",
    "C5": "调整切换门限、迟滞和定时器，减少频繁切换。",
    "C6": "重新规划 PCI，消除 PCI mod 30 冲突。",
    "C7": "结合高速移动场景优化移动性和覆盖连续性。",
    "C8": "检查 RB 调度资源，评估扩容或负载均衡。",
}


@dataclass
class ScenarioLabel:
    scenario_id: str
    source_dataset: str = "TelecomTS"
    fault_type_raw: str = "Normal"
    fault_type_cn: str = "正常"
    is_fault: int = 0
    fault_level: str = "正常"
    affected_kpis: list[str] = field(default_factory=list)
    diagnosis_text: str = ""
    station_id: str = ""


def clean(value: Any) -> str:
    if value is None:
        return ""
    return str(value).replace("\r", " ").replace("\n", " ").strip()


def to_float(value: Any) -> float | None:
    text = clean(value)
    if not text or text == "-":
        return None
    try:
        return float(text)
    except ValueError:
        return None


def fmt(value: Any) -> str:
    number = to_float(value)
    if number is None or math.isnan(number):
        return ""
    return f"{number:.8g}"


def mean_numeric(values: list[Any]) -> float | None:
    nums = [to_float(value) for value in values]
    nums = [value for value in nums if value is not None and not math.isnan(value)]
    return mean(nums) if nums else None


def first_number(*values: Any) -> float | None:
    for value in values:
        number = to_float(value)
        if number is not None and not math.isnan(number):
            return number
    return None


def max_number(*values: Any) -> float | None:
    nums = [to_float(value) for value in values]
    nums = [value for value in nums if value is not None and not math.isnan(value)]
    return max(nums) if nums else None


def telecom_fault_type(raw_fault_type: str, is_fault: bool) -> str:
    if not is_fault:
        return "正常"
    fault = raw_fault_type.lower()
    if any(token in fault for token in ["jamming", "co-channel", "doppler"]):
        return "信道干扰"
    if any(token in fault for token in ["high network congestion", "buffer overflow", "resource allocation"]):
        return "带宽不足"
    if "faulty rf filters" in fault:
        return "误码过高"
    if any(token in fault for token in ["antenna failure", "faulty handover"]):
        return "基站故障"
    return "未分类故障"


def kaggle_fault_type(answer: str) -> str:
    if answer in {"C1", "C2", "C7"}:
        return "信号中断/覆盖退化"
    if answer in {"C3", "C4", "C6"}:
        return "信道干扰"
    if answer == "C5":
        return "基站故障"
    if answer == "C8":
        return "带宽不足"
    return "未分类故障"


def fault_level(raw_fault_type: str, is_fault: bool) -> str:
    if not is_fault:
        return "正常"
    fault = raw_fault_type.lower()
    if any(token in fault for token in ["severe", "jamming", "failure"]):
        return "严重"
    if "mild" in fault:
        return "预警"
    return "一般"


def station_id_from_scenario(scenario_id: str, zone: str = "") -> str:
    if zone:
        return f"TS_ZONE_{zone.upper()}"
    return "TS_" + re.sub(r"[^A-Za-z0-9]+", "_", scenario_id).strip("_").upper()


def scenario_id_from_raw_metrics(dataset_root: Path, metrics_path: Path) -> str:
    return "__".join(metrics_path.parent.parent.relative_to(dataset_root).parts)


def scenario_id_from_jsonl(dataset_root: Path, jsonl_path: Path) -> str:
    return "__".join(jsonl_path.parent.parent.relative_to(dataset_root).parts)


def is_lfs_pointer(path: Path) -> bool:
    with path.open("r", encoding="utf-8", errors="replace") as file:
        return file.readline().startswith("version https://git-lfs.github.com/spec/v1")


def collect_telecom_labels(dataset_root: Path) -> tuple[dict[str, ScenarioLabel], list[dict[str, str]], dict[str, Any]]:
    labels: dict[str, ScenarioLabel] = {}
    fault_samples: list[dict[str, str]] = []
    stats = {"jsonl_files": 0, "real_jsonl_files": 0, "lfs_pointer_jsonl_files": 0, "jsonl_samples": 0}

    for jsonl_path in sorted(dataset_root.rglob("processed/chunked.jsonl")):
        stats["jsonl_files"] += 1
        scenario_id = scenario_id_from_jsonl(dataset_root, jsonl_path)
        if is_lfs_pointer(jsonl_path):
            stats["lfs_pointer_jsonl_files"] += 1
            continue
        stats["real_jsonl_files"] += 1
        counter: Counter[str] = Counter()
        metadata_counter: defaultdict[str, Counter[str]] = defaultdict(Counter)
        last_label = ScenarioLabel(scenario_id=scenario_id)

        with jsonl_path.open("r", encoding="utf-8", errors="replace") as file:
            for index, line in enumerate(file):
                if not line.strip():
                    continue
                item = json.loads(line)
                anomaly = item.get("anomalies") or {}
                item_labels = item.get("labels") or {}
                exists = bool(anomaly.get("exists")) or item_labels.get("anomaly_present") == "Yes"
                raw_fault = clean(anomaly.get("type")) if exists else "Normal"
                raw_fault = raw_fault or "Unknown anomaly"
                fault_cn = telecom_fault_type(raw_fault, exists)
                zone = clean(item_labels.get("zone"))
                station_id = station_id_from_scenario(scenario_id, zone)
                affected_kpis = anomaly.get("affected_kpis") or []
                diagnosis_text = clean(anomaly.get("troubleshooting_tickets"))
                stats_obj = item.get("statistics") or {}

                counter[raw_fault] += 1
                for key in ["zone", "application", "mobility", "congestion"]:
                    value = clean(item_labels.get(key))
                    if value:
                        metadata_counter[key][value] += 1

                last_label = ScenarioLabel(
                    scenario_id=scenario_id,
                    fault_type_raw=raw_fault,
                    fault_type_cn=fault_cn,
                    is_fault=1 if exists else 0,
                    fault_level=fault_level(raw_fault, exists),
                    affected_kpis=affected_kpis,
                    diagnosis_text=diagnosis_text,
                    station_id=station_id,
                )
                fault_samples.append(
                    {
                        "fault_id": f"TS_{scenario_id}_{index:05d}",
                        "source_dataset": "TelecomTS",
                        "scenario_id": scenario_id,
                        "fault_type_raw": raw_fault,
                        "fault_type_cn": fault_cn,
                        "fault_level": fault_level(raw_fault, exists),
                        "affected_kpis": ";".join(affected_kpis),
                        "start_time": clean(item.get("start_time")),
                        "end_time": clean(item.get("end_time")),
                        "station_id": station_id,
                        "fault_longitude": "",
                        "fault_latitude": "",
                        "truth_longitude": "",
                        "truth_latitude": "",
                        "localization_error_m": "",
                        "diagnosis_text": diagnosis_text,
                    }
                )
                stats["jsonl_samples"] += 1

        if counter:
            raw_fault = counter.most_common(1)[0][0]
            zone = metadata_counter["zone"].most_common(1)[0][0] if metadata_counter["zone"] else ""
            exists = raw_fault != "Normal"
            labels[scenario_id] = ScenarioLabel(
                scenario_id=scenario_id,
                fault_type_raw=raw_fault,
                fault_type_cn=telecom_fault_type(raw_fault, exists),
                is_fault=1 if exists else 0,
                fault_level=fault_level(raw_fault, exists),
                affected_kpis=last_label.affected_kpis,
                diagnosis_text=last_label.diagnosis_text,
                station_id=station_id_from_scenario(scenario_id, zone),
            )

    return labels, fault_samples, stats


def infer_telecom_label_from_path(dataset_root: Path, metrics_path: Path) -> ScenarioLabel:
    scenario_id = scenario_id_from_raw_metrics(dataset_root, metrics_path)
    parts = list(metrics_path.parent.parent.relative_to(dataset_root).parts)
    is_fault = parts[0] == "anomalous"
    raw_fault = "Normal"
    zone = ""
    if is_fault and len(parts) > 1 and parts[1] == "jammer":
        raw_fault = "Jamming"
        zone = "A"
    elif is_fault:
        raw_fault = "Unknown TelecomTS anomaly"
        zone = parts[2].replace("Zone_", "") if len(parts) > 2 else ""
    elif len(parts) > 2 and parts[1] == "stationary":
        zone = parts[2].replace("Zone_", "")
    elif len(parts) > 1 and parts[1] == "mobile":
        zone = "Mobile"
    return ScenarioLabel(
        scenario_id=scenario_id,
        fault_type_raw=raw_fault,
        fault_type_cn=telecom_fault_type(raw_fault, is_fault),
        is_fault=1 if is_fault else 0,
        fault_level=fault_level(raw_fault, is_fault),
        station_id=station_id_from_scenario(scenario_id, zone),
    )


def telecom_network_row(metric_id: int, scenario_label: ScenarioLabel, row: dict[str, str]) -> dict[str, str]:
    bler_dl = to_float(row.get("DL_BLER"))
    bler_ul = to_float(row.get("UL_BLER"))
    prb_dl = to_float(row.get("PRB_Utilization_DL"))
    prb_ul = to_float(row.get("PRB_Utilization_UL"))
    tx = to_float(row.get("TX_Bytes")) or 0.0
    rx = to_float(row.get("RX_Bytes")) or 0.0
    packet_count = (to_float(row.get("UL_NumberOfPackets")) or 0.0) + (to_float(row.get("DL_NumberOfPackets")) or 0.0)
    mcs = first_number(row.get("DL_MCS"), row.get("UL_MCS"))
    return {
        "metric_id": f"M{metric_id:08d}",
        "source_dataset": "TelecomTS",
        "scenario_id": scenario_label.scenario_id,
        "timestamp": clean(row.get("timestamp")),
        "station_id": scenario_label.station_id,
        "cell_id": "",
        "longitude": "",
        "latitude": "",
        "rsrp": fmt(row.get("RSRP")),
        "sinr": fmt(row.get("UL_SNR")),
        "ber": fmt(max_number(bler_dl, bler_ul)),
        "bler_dl": fmt(bler_dl),
        "bler_ul": fmt(bler_ul),
        "bandwidth_usage": fmt(max_number(prb_dl, prb_ul)),
        "rb_num": fmt(first_number(row.get("UL_NPRB"), row.get("PRBs_DL_Current"), row.get("PRBs_UL_Current"))),
        "throughput_mbps": "",
        "traffic_bytes": fmt(tx + rx),
        "packet_count": fmt(packet_count),
        "mcs": fmt(mcs),
        "fault_type_raw": scenario_label.fault_type_raw,
        "fault_type_cn": scenario_label.fault_type_cn,
        "is_fault": str(scenario_label.is_fault),
    }


def write_telecom(
    dataset_root: Path,
    network_writer: csv.DictWriter,
    fault_writer: csv.DictWriter,
    diagnosis_writer: csv.DictWriter,
    metric_start: int,
) -> tuple[int, dict[str, Any]]:
    labels, fault_samples, stats = collect_telecom_labels(dataset_root)
    metric_id = metric_start
    raw_metric_rows = 0
    fault_sample_keys = {row["fault_id"] for row in fault_samples}
    diagnosis_keys: set[tuple[str, str]] = set()

    for sample in fault_samples:
        fault_writer.writerow(sample)
        key = (sample["fault_type_raw"], sample["fault_type_cn"])
        if sample["fault_type_raw"] != "Normal" and key not in diagnosis_keys:
            diagnosis_keys.add(key)
            diagnosis_writer.writerow(
                {
                    "knowledge_id": f"TS_D{len(diagnosis_keys):03d}",
                    "source_dataset": "TelecomTS",
                    "fault_type_raw": sample["fault_type_raw"],
                    "fault_type_cn": sample["fault_type_cn"],
                    "root_cause": sample["fault_type_raw"],
                    "suggested_actions": sample["diagnosis_text"],
                    "review_required": "1" if sample["fault_level"] == "严重" else "0",
                }
            )

    for metrics_path in sorted(dataset_root.rglob("raw/metrics.csv")):
        scenario_id = scenario_id_from_raw_metrics(dataset_root, metrics_path)
        scenario_label = labels.get(scenario_id) or infer_telecom_label_from_path(dataset_root, metrics_path)
        chunk: list[dict[str, str]] = []
        with metrics_path.open("r", encoding="utf-8", errors="replace", newline="") as file:
            reader = csv.DictReader(file)
            for row in reader:
                network_writer.writerow(telecom_network_row(metric_id, scenario_label, row))
                metric_id += 1
                raw_metric_rows += 1
                chunk.append(row)
                if len(chunk) == 128:
                    fallback_id = f"TS_RAW_{scenario_id}_{raw_metric_rows:08d}"
                    if fallback_id not in fault_sample_keys and scenario_label.is_fault == 0:
                        fault_writer.writerow(telecom_fault_sample_from_chunk(fallback_id, scenario_label, chunk))
                    chunk = []
        if chunk and scenario_label.is_fault == 0:
            fault_writer.writerow(telecom_fault_sample_from_chunk(f"TS_RAW_{scenario_id}_{raw_metric_rows:08d}", scenario_label, chunk))

    stats["raw_metric_rows"] = raw_metric_rows
    stats["scenarios_with_labels"] = len(labels)
    return metric_id, stats


def telecom_fault_sample_from_chunk(fault_id: str, label: ScenarioLabel, rows: list[dict[str, str]]) -> dict[str, str]:
    return {
        "fault_id": fault_id,
        "source_dataset": "TelecomTS",
        "scenario_id": label.scenario_id,
        "fault_type_raw": label.fault_type_raw,
        "fault_type_cn": label.fault_type_cn,
        "fault_level": label.fault_level,
        "affected_kpis": ";".join(label.affected_kpis),
        "start_time": clean(rows[0].get("timestamp")) if rows else "",
        "end_time": clean(rows[-1].get("timestamp")) if rows else "",
        "station_id": label.station_id,
        "fault_longitude": "",
        "fault_latitude": "",
        "truth_longitude": "",
        "truth_latitude": "",
        "localization_error_m": "",
        "diagnosis_text": label.diagnosis_text,
    }


def normalize_header(header: str) -> str:
    mapping = {
        "Timestamp": "timestamp",
        "Longitude": "longitude",
        "Latitude": "latitude",
        "GPS Speed (km/h)": "gps_speed_kmh",
        "5G KPI PCell RF Serving PCI": "serving_pci",
        "5G KPI PCell RF Serving SS-RSRP [dBm]": "rsrp",
        "5G KPI PCell RF Serving SS-SINR [dB]": "sinr",
        "5G KPI PCell Layer2 MAC DL Throughput [Mbps]": "throughput_mbps",
        "5G KPI PCell Layer1 DL RB Num (Including 0)": "rb_num",
        "gNodeB ID": "gnodeb_id",
        "Cell ID": "cell_id",
        "Mechanical Azimuth": "azimuth",
        "Mechanical Downtilt": "mechanical_downtilt",
        "Digital Tilt": "digital_tilt",
        "Height": "height",
        "PCI": "pci",
        "Max Transmit Power": "tx_power",
    }
    return mapping.get(header, re.sub(r"[^a-z0-9]+", "_", header.lower()).strip("_"))


def split_pipe_table(text: str) -> list[dict[str, str]]:
    lines = [line.strip() for line in text.splitlines() if "|" in line and line.strip()]
    if not lines:
        return []
    headers = [normalize_header(part.strip()) for part in lines[0].strip("|").split("|")]
    rows = []
    for line in lines[1:]:
        values = [part.strip() for part in line.strip("|").split("|")]
        if len(values) < len(headers):
            values.extend([""] * (len(headers) - len(values)))
        rows.append(dict(zip(headers, values[: len(headers)])))
    return rows


def extract_kaggle_tables(question: str) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    user_match = re.search(
        r"User plane drive test data as follows[：:]\s*(.*?)(?:\n\s*\n(?:Engeneering|Engineering) parameters data as follows[：:])",
        question,
        flags=re.S,
    )
    station_match = re.search(r"(?:Engeneering|Engineering) parameters data as follows[：:]\s*(.*)$", question, flags=re.S)
    return (
        split_pipe_table(user_match.group(1)) if user_match else [],
        split_pipe_table(station_match.group(1)) if station_match else [],
    )


def distance_m(lon1: float | None, lat1: float | None, lon2: float | None, lat2: float | None) -> float | None:
    if None in {lon1, lat1, lon2, lat2}:
        return None
    radius = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * radius * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def station_id(row: dict[str, str]) -> str:
    return f"KG_{clean(row.get('gnodeb_id'))}_{clean(row.get('cell_id'))}_{clean(row.get('pci'))}"


def nearest_station(user_row: dict[str, str], stations: list[dict[str, str]]) -> tuple[str, float | None]:
    user_lon, user_lat = to_float(user_row.get("longitude")), to_float(user_row.get("latitude"))
    best_id = ""
    best_dist: float | None = None
    serving_pci = clean(user_row.get("serving_pci"))
    candidates = [row for row in stations if clean(row.get("pci")) == serving_pci] or stations
    for station in candidates:
        dist = distance_m(user_lon, user_lat, to_float(station.get("longitude")), to_float(station.get("latitude")))
        if dist is not None and (best_dist is None or dist < best_dist):
            best_id = station_id(station)
            best_dist = dist
    return best_id, best_dist


def write_kaggle(
    dataset_root: Path,
    network_writer: csv.DictWriter,
    fault_writer: csv.DictWriter,
    base_writer: csv.DictWriter,
    location_writer: csv.DictWriter,
    root_cause_writer: csv.DictWriter,
    diagnosis_writer: csv.DictWriter,
    metric_start: int,
) -> tuple[int, dict[str, Any]]:
    train_path = dataset_root / "train.csv"
    metric_id = metric_start
    stats = {"parsed_scenarios": 0, "skipped_scenarios": 0, "network_rows": 0, "base_station_rows": 0}
    seen_stations: set[str] = set()

    with train_path.open("r", encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)
        for row in reader:
            scenario_id = clean(row.get("ID"))
            answer = clean(row.get("answer"))
            user_rows, station_rows = extract_kaggle_tables(row.get("question") or "")
            if not scenario_id or not answer or not user_rows:
                stats["skipped_scenarios"] += 1
                continue
            stats["parsed_scenarios"] += 1
            fault_cn = kaggle_fault_type(answer)

            for station in station_rows:
                sid = station_id(station)
                if not clean(station.get("pci")) or sid in seen_stations:
                    continue
                seen_stations.add(sid)
                base_writer.writerow(
                    {
                        "station_id": sid,
                        "source_dataset": "Kaggle5GRootCause",
                        "gnodeb_id": clean(station.get("gnodeb_id")),
                        "cell_id": clean(station.get("cell_id")),
                        "pci": clean(station.get("pci")),
                        "longitude": fmt(station.get("longitude")),
                        "latitude": fmt(station.get("latitude")),
                        "height": fmt(station.get("height")),
                        "azimuth": fmt(station.get("azimuth")),
                        "downtilt": fmt(first_number(station.get("mechanical_downtilt"), station.get("digital_tilt"))),
                        "tx_power": fmt(station.get("tx_power")),
                        "status": "normal",
                    }
                )
                stats["base_station_rows"] += 1

            for idx, user in enumerate(user_rows):
                nearest_id, nearest_dist = nearest_station(user, station_rows)
                network_writer.writerow(kaggle_network_row(metric_id, scenario_id, answer, fault_cn, user))
                location_writer.writerow(
                    {
                        "location_sample_id": f"LOC_{scenario_id}_{idx:02d}",
                        "scenario_id": scenario_id,
                        "timestamp": clean(user.get("timestamp")),
                        "longitude": fmt(user.get("longitude")),
                        "latitude": fmt(user.get("latitude")),
                        "serving_pci": clean(user.get("serving_pci")),
                        "rsrp": fmt(user.get("rsrp")),
                        "sinr": fmt(user.get("sinr")),
                        "throughput_mbps": fmt(user.get("throughput_mbps")),
                        "rb_num": fmt(user.get("rb_num")),
                        "gps_speed_kmh": fmt(user.get("gps_speed_kmh")),
                        "nearest_station_id": nearest_id,
                        "nearest_station_distance_m": fmt(nearest_dist),
                        "root_cause": answer,
                        "fault_type_cn": fault_cn,
                    }
                )
                metric_id += 1
                stats["network_rows"] += 1

            root_cause_writer.writerow(kaggle_root_cause_row(scenario_id, answer, fault_cn, user_rows))
            fault_writer.writerow(kaggle_fault_sample(scenario_id, answer, fault_cn, user_rows, station_rows))

    for answer in sorted(KAGGLE_CAUSES):
        diagnosis_writer.writerow(
            {
                "knowledge_id": f"KG_{answer}",
                "source_dataset": "Kaggle5GRootCause",
                "fault_type_raw": answer,
                "fault_type_cn": kaggle_fault_type(answer),
                "root_cause": KAGGLE_CAUSES[answer],
                "suggested_actions": KAGGLE_ACTIONS[answer],
                "review_required": "1" if answer in {"C4", "C6"} else "0",
            }
        )

    return metric_id, stats


def kaggle_network_row(metric_id: int, scenario_id: str, answer: str, fault_cn: str, row: dict[str, str]) -> dict[str, str]:
    return {
        "metric_id": f"M{metric_id:08d}",
        "source_dataset": "Kaggle5GRootCause",
        "scenario_id": scenario_id,
        "timestamp": clean(row.get("timestamp")),
        "station_id": f"KG_PCI_{clean(row.get('serving_pci'))}",
        "cell_id": "",
        "longitude": fmt(row.get("longitude")),
        "latitude": fmt(row.get("latitude")),
        "rsrp": fmt(row.get("rsrp")),
        "sinr": fmt(row.get("sinr")),
        "ber": "",
        "bler_dl": "",
        "bler_ul": "",
        "bandwidth_usage": "",
        "rb_num": fmt(row.get("rb_num")),
        "throughput_mbps": fmt(row.get("throughput_mbps")),
        "traffic_bytes": "",
        "packet_count": "",
        "mcs": "",
        "fault_type_raw": answer,
        "fault_type_cn": fault_cn,
        "is_fault": "1",
    }


def kaggle_root_cause_row(scenario_id: str, answer: str, fault_cn: str, rows: list[dict[str, str]]) -> dict[str, str]:
    return {
        "root_cause_id": f"RC_{scenario_id}",
        "scenario_id": scenario_id,
        "answer": answer,
        "fault_type_cn": fault_cn,
        "root_cause_description": KAGGLE_CAUSES.get(answer, ""),
        "suggested_action": KAGGLE_ACTIONS.get(answer, ""),
        "mean_rsrp": fmt(mean_numeric([row.get("rsrp") for row in rows])),
        "mean_sinr": fmt(mean_numeric([row.get("sinr") for row in rows])),
        "mean_throughput_mbps": fmt(mean_numeric([row.get("throughput_mbps") for row in rows])),
        "mean_rb_num": fmt(mean_numeric([row.get("rb_num") for row in rows])),
        "mean_gps_speed_kmh": fmt(mean_numeric([row.get("gps_speed_kmh") for row in rows])),
    }


def kaggle_fault_sample(
    scenario_id: str,
    answer: str,
    fault_cn: str,
    user_rows: list[dict[str, str]],
    station_rows: list[dict[str, str]],
) -> dict[str, str]:
    first = user_rows[0] if user_rows else {}
    nearest_id, nearest_dist = nearest_station(first, station_rows) if user_rows else ("", None)
    truth_station = next((station for station in station_rows if station_id(station) == nearest_id), {})
    user_lon = mean_numeric([row.get("longitude") for row in user_rows])
    user_lat = mean_numeric([row.get("latitude") for row in user_rows])
    truth_lon = to_float(truth_station.get("longitude"))
    truth_lat = to_float(truth_station.get("latitude"))
    return {
        "fault_id": f"KG_{scenario_id}",
        "source_dataset": "Kaggle5GRootCause",
        "scenario_id": scenario_id,
        "fault_type_raw": answer,
        "fault_type_cn": fault_cn,
        "fault_level": "严重" if answer in {"C4", "C6"} else "一般",
        "affected_kpis": "RSRP;SINR;throughput_mbps;rb_num;serving_pci",
        "start_time": clean(user_rows[0].get("timestamp")) if user_rows else "",
        "end_time": clean(user_rows[-1].get("timestamp")) if user_rows else "",
        "station_id": nearest_id,
        "fault_longitude": fmt(user_lon),
        "fault_latitude": fmt(user_lat),
        "truth_longitude": fmt(truth_lon),
        "truth_latitude": fmt(truth_lat),
        "localization_error_m": fmt(distance_m(user_lon, user_lat, truth_lon, truth_lat)),
        "diagnosis_text": KAGGLE_ACTIONS.get(answer, ""),
    }


def write_manifest(output_dir: Path, stats: dict[str, Any]) -> None:
    stats["generated_at"] = datetime.now().isoformat(timespec="seconds")
    stats["outputs"] = {
        "network_metrics": "network_metrics.csv",
        "fault_samples": "fault_samples.csv",
        "diagnosis_knowledge": "diagnosis_knowledge.csv",
        "base_stations": "base_stations.csv",
        "location_samples": "location_samples.csv",
        "root_cause_samples": "root_cause_samples.csv",
    }
    stats["fault_type_mapping_version"] = "phase1_data_system_design.md"
    (output_dir / "dataset_manifest.json").write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")


def build_dataset(datasets_root: Path, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    stale_triangulation_path = output_dir / "triangulation_observations.csv"
    if stale_triangulation_path.exists():
        stale_triangulation_path.unlink()
    paths = {
        "network_metrics": output_dir / "network_metrics.csv",
        "fault_samples": output_dir / "fault_samples.csv",
        "diagnosis_knowledge": output_dir / "diagnosis_knowledge.csv",
        "base_stations": output_dir / "base_stations.csv",
        "location_samples": output_dir / "location_samples.csv",
        "root_cause_samples": output_dir / "root_cause_samples.csv",
    }

    with (
        paths["network_metrics"].open("w", encoding="utf-8-sig", newline="") as network_file,
        paths["fault_samples"].open("w", encoding="utf-8-sig", newline="") as fault_file,
        paths["diagnosis_knowledge"].open("w", encoding="utf-8-sig", newline="") as diagnosis_file,
        paths["base_stations"].open("w", encoding="utf-8-sig", newline="") as base_file,
        paths["location_samples"].open("w", encoding="utf-8-sig", newline="") as location_file,
        paths["root_cause_samples"].open("w", encoding="utf-8-sig", newline="") as root_cause_file,
    ):
        network_writer = csv.DictWriter(network_file, fieldnames=NETWORK_METRICS_COLUMNS)
        fault_writer = csv.DictWriter(fault_file, fieldnames=FAULT_SAMPLES_COLUMNS)
        diagnosis_writer = csv.DictWriter(diagnosis_file, fieldnames=DIAGNOSIS_COLUMNS)
        base_writer = csv.DictWriter(base_file, fieldnames=BASE_STATIONS_COLUMNS)
        location_writer = csv.DictWriter(location_file, fieldnames=LOCATION_COLUMNS)
        root_cause_writer = csv.DictWriter(root_cause_file, fieldnames=ROOT_CAUSE_COLUMNS)
        for writer in [network_writer, fault_writer, diagnosis_writer, base_writer, location_writer, root_cause_writer]:
            writer.writeheader()

        next_metric_id, telecom_stats = write_telecom(
            datasets_root / "TelecomTS",
            network_writer,
            fault_writer,
            diagnosis_writer,
            1,
        )
        next_metric_id, kaggle_stats = write_kaggle(
            datasets_root / "kaggle",
            network_writer,
            fault_writer,
            base_writer,
            location_writer,
            root_cause_writer,
            diagnosis_writer,
            next_metric_id,
        )

    write_manifest(
        output_dir,
        {
            "source_datasets": {
                "TelecomTS": telecom_stats,
                "Kaggle5GRootCause": kaggle_stats,
            },
            "total_metric_rows": next_metric_id - 1,
        },
    )


def parse_args() -> argparse.Namespace:
    from backend.src.utils.config import DATASETS_ROOT, PROCESSED_DIR

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--datasets-root", type=Path, default=DATASETS_ROOT)
    parser.add_argument("--output-dir", type=Path, default=PROCESSED_DIR)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    build_dataset(args.datasets_root, args.output_dir)
    print(f"Phase-2 dataset written to {args.output_dir}")


if __name__ == "__main__":
    main()
