from __future__ import annotations

from fastapi import APIRouter

from backend.src.api.routes.common import not_found, success
from backend.src.database.repository import Repository


router = APIRouter(tags=["diagnosis"])


@router.get("/diagnosis/{fault_id}")
def diagnosis_for_fault(fault_id: str) -> dict:
    diagnosis = Repository().diagnosis_for_fault(fault_id)
    if diagnosis is None:
        not_found("fault not found")
    return success(diagnosis)
