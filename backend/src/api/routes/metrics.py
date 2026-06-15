from __future__ import annotations

from fastapi import APIRouter

from backend.src.api.routes.common import success
from backend.src.database.repository import Repository


router = APIRouter(tags=["metrics"])


@router.get("/metrics/realtime")
def realtime_metrics(limit: int = 200) -> dict:
    return success(Repository().realtime_metrics(limit=limit))
