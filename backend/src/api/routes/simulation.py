from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter

from backend.src.api.routes.common import success


router = APIRouter(tags=["simulation"])
BACKEND_ROOT = Path(__file__).resolve().parents[3]


@router.post("/simulation/run")
def simulation_run() -> dict:
    processed_dir = BACKEND_ROOT / "data" / "processed"
    return success(
        {
            "processed_data_available": processed_dir.exists(),
            "processed_dir": str(processed_dir),
            "message": "当前项目采用公网数据接入路线；该接口用于演示触发数据加载状态。",
        }
    )
