from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from backend.src.api.routes.common import not_found, success
from backend.src.database.repository import Repository
from backend.src.diagnosis.service import DiagnosisService


router = APIRouter(tags=["diagnosis"])


class LLMEnhanceRequest(BaseModel):
    base_url: str | None = Field(default=None)
    api_key: str
    model: str | None = Field(default=None)
    timeout_seconds: float | None = Field(default=None, ge=1, le=60)


@router.get("/diagnosis/{fault_id}")
def diagnosis_for_fault(fault_id: str, enhance: str | None = None) -> dict:
    diagnosis = DiagnosisService(Repository()).diagnosis_for_fault(fault_id, enhance=enhance)
    if diagnosis is None:
        not_found("fault not found")
    return success(diagnosis)


@router.post("/diagnosis/{fault_id}/enhance")
def enhance_diagnosis_for_fault(fault_id: str, payload: LLMEnhanceRequest) -> dict:
    diagnosis = DiagnosisService(Repository()).diagnosis_for_fault_with_llm_config(
        fault_id,
        api_key=payload.api_key,
        base_url=payload.base_url,
        model=payload.model,
        timeout_seconds=payload.timeout_seconds,
    )
    if diagnosis is None:
        not_found("fault not found")
    return success(diagnosis)
