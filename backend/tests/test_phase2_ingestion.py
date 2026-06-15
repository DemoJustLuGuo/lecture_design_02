from __future__ import annotations

import csv
import json
from collections import Counter
from pathlib import Path


PROCESSED_DIR = Path(__file__).resolve().parents[1] / "data" / "processed"


def read_csv(name: str) -> list[dict[str, str]]:
    with (PROCESSED_DIR / name).open("r", encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


def test_phase2_output_files_exist() -> None:
    expected = {
        "network_metrics.csv",
        "fault_samples.csv",
        "diagnosis_knowledge.csv",
        "base_stations.csv",
        "location_samples.csv",
        "root_cause_samples.csv",
        "dataset_manifest.json",
    }
    assert expected.issubset({path.name for path in PROCESSED_DIR.iterdir()})


def test_network_metrics_cover_phase2_requirements() -> None:
    rows = read_csv("network_metrics.csv")
    fault_types = {row["fault_type_cn"] for row in rows}
    sources = {row["source_dataset"] for row in rows}

    assert len(rows) >= 3000
    assert {"TelecomTS", "Kaggle5GRootCause"}.issubset(sources)
    assert {"信号中断/覆盖退化", "误码过高", "带宽不足", "基站故障", "信道干扰"}.issubset(fault_types)
    assert {"metric_id", "rsrp", "sinr", "fault_type_raw", "fault_type_cn", "is_fault"}.issubset(rows[0])


def test_kaggle_location_and_root_cause_outputs_are_available() -> None:
    base_stations = read_csv("base_stations.csv")
    location_samples = read_csv("location_samples.csv")
    root_causes = read_csv("root_cause_samples.csv")
    answers = {row["answer"] for row in root_causes}

    assert len(base_stations) > 0
    assert len(location_samples) >= 3000
    assert set("C1 C2 C3 C4 C5 C6 C7 C8".split()).issubset(answers)
    assert all(row["longitude"] and row["latitude"] for row in base_stations[:20])


def test_fault_samples_and_diagnosis_match_mapping() -> None:
    faults = read_csv("fault_samples.csv")
    diagnosis = read_csv("diagnosis_knowledge.csv")
    counts = Counter(row["fault_type_cn"] for row in faults)
    diagnosis_types = {row["fault_type_cn"] for row in diagnosis}

    assert counts["正常"] > 0
    assert counts["信道干扰"] > 0
    assert counts["信号中断/覆盖退化"] > 0
    assert {"信号中断/覆盖退化", "误码过高", "带宽不足", "基站故障", "信道干扰"}.issubset(diagnosis_types)


def test_manifest_records_source_dataset_stats() -> None:
    manifest = json.loads((PROCESSED_DIR / "dataset_manifest.json").read_text(encoding="utf-8"))
    telecom = manifest["source_datasets"]["TelecomTS"]
    kaggle = manifest["source_datasets"]["Kaggle5GRootCause"]

    assert manifest["total_metric_rows"] >= 3000
    assert telecom["raw_metric_rows"] > 0
    assert telecom["lfs_pointer_jsonl_files"] >= 0
    assert kaggle["parsed_scenarios"] == 2400
    assert kaggle["base_station_rows"] > 0
