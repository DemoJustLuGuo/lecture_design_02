from __future__ import annotations

from fastapi import APIRouter

from backend.src.api.routes.common import success
from backend.src.database.repository import Repository


router = APIRouter(tags=["dashboard"])


@router.get("/dashboard/summary")
def dashboard_summary() -> dict:
    return success(Repository().dashboard_summary())
