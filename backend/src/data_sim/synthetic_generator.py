from __future__ import annotations

import csv
import json
import math
import random
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from backend.src.data_ingestion.build_phase2_dataset import (
    BASE_STATIONS_COLUMNS,
    DIAGNOSIS_COLUMNS,
    FAULT_SAMPLES_COLUMNS,
    LOCATION_COLUMNS,
    NETWORK_METRICS_COLUMNS,
    ROOT_CAUSE_COLUMNS,
)
from backend.src.models.locator import (
    anchor_reliability_weight,
    distance_m,
    nearest_stations,
    weighted_least_squares_trilateration,
)


TRIANGULATION_COLUMNS = [
    "observation_id",
    "fault_id",
    "timestamp",
    "station_id",
    "station_longitude",
    "station_latitude",
    "true_distance_m",
    "distance_est_m",
    "measurement_noise_m",
    "rsrp",
    "sinr",
]

FAULT_TYPES = [
    "信号中断/覆盖退化",
    "误码过高",
    "带宽不足",
    "基站故障",
    "信道干扰",
]

FAULT_RULES = {
    "信号中断/覆盖退化": {
        "raw": "Synthetic signal outage or coverage degradation",
        "level": "严重",
        "affected_kpis": "rsrp;sinr;throughput_mbps",
        "root_cause": "覆盖区域内信号强度明显下降，可能存在天馈故障、遮挡或发射功率异常。",
        "action": "检查基站供电、射频模块、天馈连接和覆盖边界，必要时调整功率或方位角。",
    },
    "误码过高": {
        "raw": "Synthetic high bit error rate",
        "level": "预警",
        "affected_kpis": "ber;bler_dl;bler_ul;sinr",
        "root_cause": "误码率升高且链路质量下降，可能由干扰、设备老化或编码配置异常引起。",
        "action": "排查同频干扰和设备状态，复核调制编码配置并观察 BLER 指标。",
    },
    "带宽不足": {
        "raw": "Synthetic bandwidth congestion",
        "level": "一般",
        "affected_kpis": "bandwidth_usage;rb_num;throughput_mbps",
        "root_cause": "无线资源占用率偏高，用户吞吐下降，疑似小区拥塞或资源调度不足。",
        "action": "分析高峰流量，检查 RB 调度，评估扩容、负载均衡或限流策略。",
    },
    "基站故障": {
        "raw": "Synthetic base station equipment fault",
        "level": "严重",
        "affected_kpis": "rsrp;sinr;ber;throughput_mbps",
        "root_cause": "同一基站多项指标同时恶化，可能存在设备、传输或电源侧故障。",
        "action": "查看设备告警、传输链路和电源状态，必要时重启服务或切换备用设备。",
    },
    "信道干扰": {
        "raw": "Synthetic channel interference",
        "level": "预警",
        "affected_kpis": "sinr;ber;throughput_mbps",
        "root_cause": "SINR 明显下降并伴随误码升高，可能存在同频、邻频或 PCI 冲突干扰。",
        "action": "定位干扰源，优化频点、PCI 和发射功率，复核邻区关系。",
    },
}


def fmt(value: float | int | str | None) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return f"{value:.8g}"


def clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, value))


def write_csv(path: Path, columns: list[str], rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=columns)
        writer.writeheader()
        for row in rows:
            writer.writerow({column: row.get(column, "") for column in columns})


def station_rows(
    station_count: int,
    rng: random.Random,
    area_bounds: tuple[float, float, float, float] | None = None,
) -> list[dict[str, str]]:
    rows = []
    if area_bounds is None:
        base_lon = 116.38
        base_lat = 39.9
        min_lng, min_lat, max_lng, max_lat = base_lon - 0.08, base_lat - 0.06, base_lon + 0.08, base_lat + 0.06
    else:
        min_lng, min_lat, max_lng, max_lat = area_bounds

    for index in range(station_count):
        rows.append(
            {
                "station_id": f"SYN_BS_{index + 1:04d}",
                "source_dataset": "Synthetic",
                "gnodeb_id": f"SYN_GNB_{index + 1:04d}",
                "cell_id": str((index % 3) + 1),
                "pci": str(100 + index),
                "longitude": fmt(rng.uniform(min_lng, max_lng)),
                "latitude": fmt(rng.uniform(min_lat, max_lat)),
                "height": fmt(rng.uniform(25, 55)),
                "azimuth": fmt((index * 37) % 360),
                "downtilt": fmt(rng.uniform(3, 10)),
                "tx_power": fmt(rng.uniform(38, 46)),
                "status": "normal",
            }
        )
    return rows


def choose_fault_type(index: int) -> str:
    return FAULT_TYPES[index % len(FAULT_TYPES)]


def apply_fault_metrics(
    fault_type: str,
    rsrp: float,
    sinr: float,
    ber: float,
    bandwidth_usage: float,
    rb_num: float,
    throughput_mbps: float,
    rng: random.Random,
) -> tuple[float, float, float, float, float, float]:
    if fault_type == "信号中断/覆盖退化":
        rsrp -= rng.uniform(18, 32)
        sinr -= rng.uniform(8, 16)
        throughput_mbps *= rng.uniform(0.08, 0.3)
    elif fault_type == "误码过高":
        sinr -= rng.uniform(4, 9)
        ber = rng.uniform(0.035, 0.12)
        throughput_mbps *= rng.uniform(0.35, 0.65)
    elif fault_type == "带宽不足":
        bandwidth_usage = rng.uniform(88, 99)
        rb_num = rng.uniform(170, 240)
        throughput_mbps *= rng.uniform(0.35, 0.7)
    elif fault_type == "基站故障":
        rsrp -= rng.uniform(12, 24)
        sinr -= rng.uniform(7, 14)
        ber = rng.uniform(0.025, 0.09)
        throughput_mbps *= rng.uniform(0.12, 0.45)
    elif fault_type == "信道干扰":
        sinr -= rng.uniform(10, 20)
        ber = rng.uniform(0.02, 0.08)
        throughput_mbps *= rng.uniform(0.3, 0.65)
    return (
        clamp(rsrp, -135, -55),
        clamp(sinr, -12, 32),
        clamp(ber, 0, 0.2),
        clamp(bandwidth_usage, 5, 100),
        clamp(rb_num, 20, 260),
        clamp(throughput_mbps, 0.1, 1200),
    )


def triangulate_fault_location(
    fault_id: str,
    timestamp: str,
    stations: list[dict[str, str]],
    truth_lon: float,
    truth_lat: float,
    rng: random.Random,
    base_rsrp: float,
    base_sinr: float,
) -> tuple[float, float, float, str, list[dict[str, str]]]:
    anchors = nearest_stations(stations, truth_lon, truth_lat, count=min(5, len(stations)))
    distance_estimates: list[float] = []
    weights: list[float] = []
    observation_rows: list[dict[str, str]] = []

    for observation_index, station in enumerate(anchors, start=1):
        station_lon = float(station["longitude"])
        station_lat = float(station["latitude"])
        true_distance = distance_m(truth_lon, truth_lat, station_lon, station_lat)
        noise = rng.gauss(0, max(8.0, true_distance * 0.035))
        distance_est = max(10.0, true_distance + noise)
        anchor_rsrp = clamp(base_rsrp - 20 * math.log10(max(distance_est, 10.0) / 100.0), -135, -55)
        anchor_sinr = clamp(base_sinr - rng.uniform(0.4, 2.2), -12, 32)
        distance_estimates.append(distance_est)
        weights.append(anchor_reliability_weight(distance_est, rsrp=anchor_rsrp, sinr=anchor_sinr))
        observation_rows.append(
            {
                "observation_id": f"TRI_{fault_id}_{observation_index}",
                "fault_id": fault_id,
                "timestamp": timestamp,
                "station_id": station["station_id"],
                "station_longitude": station["longitude"],
                "station_latitude": station["latitude"],
                "true_distance_m": fmt(true_distance),
                "distance_est_m": fmt(distance_est),
                "measurement_noise_m": fmt(distance_est - true_distance),
                "rsrp": fmt(anchor_rsrp),
                "sinr": fmt(anchor_sinr),
            }
        )

    estimated_lon, estimated_lat = weighted_least_squares_trilateration(
        anchors, distance_estimates, weights, truth_lon, truth_lat
    )
    error = distance_m(estimated_lon, estimated_lat, truth_lon, truth_lat)
    return estimated_lon, estimated_lat, error, anchors[0]["station_id"], observation_rows


def metric_rows(
    stations: list[dict[str, str]],
    metric_count: int,
    fault_ratio: float,
    seed: int,
    enable_triangulation: bool = False,
) -> tuple[list[dict[str, str]], list[dict[str, str]], list[dict[str, str]], list[dict[str, str]], list[dict[str, str]]]:
    rng = random.Random(seed + 17)
    fault_target = max(len(FAULT_TYPES), int(metric_count * fault_ratio))
    fault_indices = set(rng.sample(range(metric_count), min(metric_count, fault_target)))
    start = datetime.now().replace(microsecond=0) - timedelta(minutes=metric_count)
    metrics: list[dict[str, str]] = []
    faults: list[dict[str, str]] = []
    locations: list[dict[str, str]] = []
    root_causes: list[dict[str, str]] = []
    triangulation_observations: list[dict[str, str]] = []

    for index in range(metric_count):
        station = stations[index % len(stations)]
        station_lon = float(station["longitude"])
        station_lat = float(station["latitude"])
        longitude = station_lon + rng.uniform(-0.006, 0.006)
        latitude = station_lat + rng.uniform(-0.004, 0.004)
        rsrp = rng.gauss(-86, 8)
        sinr = rng.gauss(18, 5)
        ber = abs(rng.gauss(0.003, 0.002))
        bandwidth_usage = rng.uniform(35, 75)
        rb_num = rng.uniform(60, 155)
        throughput_mbps = rng.uniform(120, 680)
        is_fault = index in fault_indices
        fault_type = "正常"
        fault_raw = "Normal"

        if is_fault:
            fault_type = choose_fault_type(index)
            fault_raw = FAULT_RULES[fault_type]["raw"]
            rsrp, sinr, ber, bandwidth_usage, rb_num, throughput_mbps = apply_fault_metrics(
                fault_type,
                rsrp,
                sinr,
                ber,
                bandwidth_usage,
                rb_num,
                throughput_mbps,
                rng,
            )

        metric_id = f"SYN_M{index + 1:08d}"
        timestamp = (start + timedelta(minutes=index)).isoformat(timespec="seconds")
        metrics.append(
            {
                "metric_id": metric_id,
                "source_dataset": "Synthetic",
                "scenario_id": f"SYN_SCENARIO_{(index // max(1, len(stations))):04d}",
                "timestamp": timestamp,
                "station_id": station["station_id"],
                "cell_id": station["cell_id"],
                "longitude": fmt(longitude),
                "latitude": fmt(latitude),
                "rsrp": fmt(rsrp),
                "sinr": fmt(sinr),
                "ber": fmt(ber),
                "bler_dl": fmt(ber * rng.uniform(0.8, 1.3)),
                "bler_ul": fmt(ber * rng.uniform(0.7, 1.2)),
                "bandwidth_usage": fmt(bandwidth_usage),
                "rb_num": fmt(rb_num),
                "throughput_mbps": fmt(throughput_mbps),
                "traffic_bytes": fmt(throughput_mbps * 125000),
                "packet_count": fmt(rng.uniform(900, 6000)),
                "mcs": fmt(clamp(sinr + rng.uniform(2, 8), 0, 28)),
                "fault_type_raw": fault_raw,
                "fault_type_cn": fault_type,
                "is_fault": "1" if is_fault else "0",
            }
        )

        if is_fault:
            rule = FAULT_RULES[fault_type]
            fault_id = f"SYN_F{index + 1:08d}"
            if enable_triangulation and len(stations) >= 3:
                estimated_lon, estimated_lat, error, located_station_id, observations = triangulate_fault_location(
                    fault_id=fault_id,
                    timestamp=timestamp,
                    stations=stations,
                    truth_lon=longitude,
                    truth_lat=latitude,
                    rng=rng,
                    base_rsrp=rsrp,
                    base_sinr=sinr,
                )
                truth_lon = longitude
                truth_lat = latitude
                triangulation_observations.extend(observations)
            else:
                estimated_lon = longitude + rng.uniform(-0.0015, 0.0015)
                estimated_lat = latitude + rng.uniform(-0.0012, 0.0012)
                error = distance_m(estimated_lon, estimated_lat, station_lon, station_lat)
                truth_lon = station_lon
                truth_lat = station_lat
                located_station_id = station["station_id"]
            faults.append(
                {
                    "fault_id": fault_id,
                    "source_dataset": "Synthetic",
                    "scenario_id": f"SYN_SCENARIO_{(index // max(1, len(stations))):04d}",
                    "fault_type_raw": rule["raw"],
                    "fault_type_cn": fault_type,
                    "fault_level": rule["level"],
                    "affected_kpis": rule["affected_kpis"],
                    "start_time": timestamp,
                    "end_time": timestamp,
                    "station_id": located_station_id,
                    "fault_longitude": fmt(estimated_lon),
                    "fault_latitude": fmt(estimated_lat),
                    "truth_longitude": fmt(truth_lon),
                    "truth_latitude": fmt(truth_lat),
                    "localization_error_m": fmt(error),
                    "diagnosis_text": rule["action"],
                }
            )
            locations.append(
                {
                    "location_sample_id": f"SYN_LOC_{index + 1:08d}",
                    "scenario_id": f"SYN_SCENARIO_{(index // max(1, len(stations))):04d}",
                    "timestamp": timestamp,
                    "longitude": fmt(longitude),
                    "latitude": fmt(latitude),
                    "serving_pci": station["pci"],
                    "rsrp": fmt(rsrp),
                    "sinr": fmt(sinr),
                    "throughput_mbps": fmt(throughput_mbps),
                    "rb_num": fmt(rb_num),
                    "gps_speed_kmh": fmt(rng.uniform(0, 45)),
                    "nearest_station_id": station["station_id"],
                    "nearest_station_distance_m": fmt(distance_m(longitude, latitude, station_lon, station_lat)),
                    "root_cause": rule["root_cause"],
                    "fault_type_cn": fault_type,
                }
            )
            root_causes.append(
                {
                    "root_cause_id": f"SYN_RC_{index + 1:08d}",
                    "scenario_id": f"SYN_SCENARIO_{(index // max(1, len(stations))):04d}",
                    "answer": fault_type,
                    "fault_type_cn": fault_type,
                    "root_cause_description": rule["root_cause"],
                    "suggested_action": rule["action"],
                    "mean_rsrp": fmt(rsrp),
                    "mean_sinr": fmt(sinr),
                    "mean_throughput_mbps": fmt(throughput_mbps),
                    "mean_rb_num": fmt(rb_num),
                    "mean_gps_speed_kmh": fmt(rng.uniform(0, 45)),
                }
            )

    return metrics, faults, locations, root_causes, triangulation_observations


def diagnosis_rows() -> list[dict[str, str]]:
    rows = []
    for index, fault_type in enumerate(FAULT_TYPES, start=1):
        rule = FAULT_RULES[fault_type]
        rows.append(
            {
                "knowledge_id": f"SYN_D{index:03d}",
                "source_dataset": "Synthetic",
                "fault_type_raw": rule["raw"],
                "fault_type_cn": fault_type,
                "root_cause": rule["root_cause"],
                "suggested_actions": rule["action"],
                "review_required": "1" if rule["level"] == "严重" else "0",
            }
        )
    return rows


def generate_synthetic_processed_dataset(
    output_dir: Path,
    station_count: int = 20,
    metric_count: int = 5000,
    fault_ratio: float = 0.15,
    seed: int = 42,
    area_bounds: tuple[float, float, float, float] | None = None,
    enable_triangulation: bool = False,
) -> dict[str, Any]:
    safe_station_count = max(3 if enable_triangulation else 1, min(station_count, 500))
    safe_metric_count = max(1, min(metric_count, 200_000))
    safe_fault_ratio = clamp(fault_ratio, 0.0, 1.0)

    output_dir.mkdir(parents=True, exist_ok=True)
    rng = random.Random(seed)
    stations = station_rows(safe_station_count, rng, area_bounds=area_bounds)
    metrics, faults, locations, root_causes, triangulation_observations = metric_rows(
        stations,
        safe_metric_count,
        safe_fault_ratio,
        seed,
        enable_triangulation=enable_triangulation,
    )
    diagnosis = diagnosis_rows()

    write_csv(output_dir / "base_stations.csv", BASE_STATIONS_COLUMNS, stations)
    write_csv(output_dir / "network_metrics.csv", NETWORK_METRICS_COLUMNS, metrics)
    write_csv(output_dir / "fault_samples.csv", FAULT_SAMPLES_COLUMNS, faults)
    write_csv(output_dir / "diagnosis_knowledge.csv", DIAGNOSIS_COLUMNS, diagnosis)
    write_csv(output_dir / "location_samples.csv", LOCATION_COLUMNS, locations)
    write_csv(output_dir / "root_cause_samples.csv", ROOT_CAUSE_COLUMNS, root_causes)
    write_csv(output_dir / "triangulation_observations.csv", TRIANGULATION_COLUMNS, triangulation_observations)

    fault_type_counts = Counter(row["fault_type_cn"] for row in faults)
    manifest = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "generator": "synthetic_generator",
        "parameters": {
            "station_count": safe_station_count,
            "metric_count": safe_metric_count,
            "fault_ratio": safe_fault_ratio,
            "seed": seed,
            "area_bounds": {
                "min_lng": area_bounds[0],
                "min_lat": area_bounds[1],
                "max_lng": area_bounds[2],
                "max_lat": area_bounds[3],
            } if area_bounds else None,
            "enable_triangulation": enable_triangulation,
        },
        "outputs": {
            "network_metrics": "network_metrics.csv",
            "fault_samples": "fault_samples.csv",
            "diagnosis_knowledge": "diagnosis_knowledge.csv",
            "base_stations": "base_stations.csv",
            "location_samples": "location_samples.csv",
            "root_cause_samples": "root_cause_samples.csv",
            "triangulation_observations": "triangulation_observations.csv",
        },
        "source_datasets": {
            "Synthetic": {
                "station_rows": len(stations),
                "network_rows": len(metrics),
                "fault_rows": len(faults),
                "triangulation_observation_rows": len(triangulation_observations),
                "fault_type_counts": dict(fault_type_counts),
            }
        },
        "total_metric_rows": len(metrics),
    }
    (output_dir / "dataset_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    return {
        "generated": True,
        "mode": "generate_synthetic_processed_dataset",
        "output_dir": str(output_dir),
        "parameters": manifest["parameters"],
        "generated_files": {
            "base_stations": len(stations),
            "network_metrics": len(metrics),
            "fault_samples": len(faults),
            "diagnosis_knowledge": len(diagnosis),
            "location_samples": len(locations),
            "root_cause_samples": len(root_causes),
            "triangulation_observations": len(triangulation_observations),
        },
        "fault_type_counts": dict(fault_type_counts),
        "message": "合成演示数据已生成到 processed 目录。",
    }
