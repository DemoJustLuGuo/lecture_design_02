from __future__ import annotations

from fastapi import APIRouter

from backend.src.api.routes.common import not_found, success
from backend.src.database.repository import Repository


router = APIRouter(tags=["stations"])


@router.get("/stations")
def list_stations(limit: int = 200) -> dict:
    return success(Repository().list_stations(limit=limit))


@router.get("/stations/{station_id}")
def get_station(station_id: str) -> dict:
    station = Repository().get_station(station_id)
    if station is None:
        not_found("station not found")
    return success(station)
