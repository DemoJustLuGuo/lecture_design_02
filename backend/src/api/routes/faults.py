from __future__ import annotations

from fastapi import APIRouter, Query

from backend.src.api.routes.common import not_found, success
from backend.src.database.repository import Repository
from backend.src.models.inference import classify_faults as run_fault_classification
from backend.src.models.inference import detect_anomalies


router = APIRouter(tags=["faults"])


@router.get("/faults")
def list_faults(fault_type: str | None = None, fault_level: str | None = None, limit: int = 200) -> dict:
    return success(Repository().list_faults(fault_type=fault_type, fault_level=fault_level, limit=limit))


@router.get("/faults/{fault_id}")
def get_fault(fault_id: str) -> dict:
    fault = Repository().get_fault(fault_id)
    if fault is None:
        not_found("fault not found")
    return success(fault)


def _load_inference_metrics(
    limit: int,
    metric_id: str | None,
    source_dataset: str | None,
) -> list[dict]:
    records = Repository().inference_metrics(
        limit=1 if metric_id else limit,
        metric_id=metric_id,
        source_dataset=source_dataset,
    )
    if not records:
        not_found("inference metric samples not found")
    return records


@router.post("/faults/detect")
def detect_faults(
    limit: int = Query(default=20, ge=1, le=200),
    metric_id: str | None = None,
    source_dataset: str | None = "TelecomTS",
) -> dict:
    records = _load_inference_metrics(limit=limit, metric_id=metric_id, source_dataset=source_dataset)
    return success(
        detect_anomalies(records),
        message="异常检测已完成。",
    )


@router.post("/faults/classify")
def classify_faults(
    limit: int = Query(default=20, ge=1, le=200),
    metric_id: str | None = None,
    source_dataset: str | None = "TelecomTS",
) -> dict:
    records = _load_inference_metrics(limit=limit, metric_id=metric_id, source_dataset=source_dataset)
    return success(
        run_fault_classification(records),
        message="故障分类已完成。",
    )
