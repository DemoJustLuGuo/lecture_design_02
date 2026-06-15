from __future__ import annotations

from fastapi import APIRouter

from backend.src.api.routes.common import success
from backend.src.database.repository import Repository


router = APIRouter(tags=["model"])


@router.get("/model/evaluation")
def model_evaluation() -> dict:
    return success(Repository().model_evaluation())
