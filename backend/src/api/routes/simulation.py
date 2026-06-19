from __future__ import annotations

from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile

from backend.src.api.routes.common import success
from backend.src.data_ingestion.demo_loader import refresh_demo_database
from backend.src.data_ingestion.external_importer import import_external_network_data
from backend.src.data_sim.synthetic_generator import generate_synthetic_processed_dataset
from backend.src.database.db import DATABASE_PATH
from backend.src.utils.config import BACKEND_ROOT


router = APIRouter(tags=["simulation"])
SIMULATION_IMPORT_DB_PATH = DATABASE_PATH


def generated_preview_root() -> Path:
    return BACKEND_ROOT / "data" / "generated_preview"


def new_preview_id(prefix: str) -> str:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return f"{prefix}_{timestamp}_{uuid4().hex[:8]}"


def preview_dir_for(preview_id: str) -> Path:
    if not preview_id or any(part in preview_id for part in ("/", "\\", "..")):
        raise HTTPException(
            status_code=400,
            detail={"success": False, "data": None, "message": "预览批次ID无效。"},
        )
    return generated_preview_root() / preview_id


def choose_generation_output_dir(refresh_db: bool, prefix: str) -> tuple[Path, str | None, str]:
    if refresh_db:
        return BACKEND_ROOT / "data" / "processed", None, "processed"
    preview_id = new_preview_id(prefix)
    return preview_dir_for(preview_id), preview_id, "preview"


def annotate_generation_result(
    generated: dict,
    preview_id: str | None,
    output_scope: str,
    message: str,
) -> dict:
    generated["preview_id"] = preview_id
    generated["output_scope"] = output_scope
    generated["message"] = message
    return generated


@router.post("/simulation/run")
def simulation_run() -> dict:
    return success(refresh_demo_database(), message="演示数据刷新完成。")


@router.post("/simulation/generate")
def simulation_generate(
    station_count: int = Query(20, ge=1, le=500),
    metric_count: int = Query(5000, ge=1, le=200000),
    fault_ratio: float = Query(0.15, ge=0.0, le=1.0),
    seed: int = Query(42),
    refresh_db: bool = Query(True),
) -> dict:
    output_dir, preview_id, output_scope = choose_generation_output_dir(refresh_db, "synthetic")
    generated = generate_synthetic_processed_dataset(
        output_dir=output_dir,
        station_count=station_count,
        metric_count=metric_count,
        fault_ratio=fault_ratio,
        seed=seed,
    )
    annotate_generation_result(
        generated,
        preview_id=preview_id,
        output_scope=output_scope,
        message=(
            "合成演示数据已生成到 processed 目录并可刷新 SQLite。"
            if refresh_db
            else "合成演示数据已生成到预览目录，尚未写入 SQLite。"
        ),
    )
    if refresh_db:
        generated["refresh"] = refresh_demo_database(processed_dir=output_dir)
    return success(generated, message="合成演示数据生成完成。")


@router.post("/simulation/generate-area")
def simulation_generate_area(
    min_lng: float = Query(..., ge=-180, le=180),
    min_lat: float = Query(..., ge=-90, le=90),
    max_lng: float = Query(..., ge=-180, le=180),
    max_lat: float = Query(..., ge=-90, le=90),
    station_count: int = Query(12, ge=3, le=500),
    metric_count: int = Query(3000, ge=1, le=200000),
    fault_ratio: float = Query(0.15, ge=0.0, le=1.0),
    seed: int = Query(42),
    enable_triangulation: bool = Query(True),
    refresh_db: bool = Query(True),
) -> dict:
    if min_lng >= max_lng or min_lat >= max_lat:
        raise HTTPException(
            status_code=400,
            detail={"success": False, "data": None, "message": "区域边界无效，请保证左下角小于右上角。"},
        )

    output_dir, preview_id, output_scope = choose_generation_output_dir(refresh_db, "area")
    generated = generate_synthetic_processed_dataset(
        output_dir=output_dir,
        station_count=station_count,
        metric_count=metric_count,
        fault_ratio=fault_ratio,
        seed=seed,
        area_bounds=(min_lng, min_lat, max_lng, max_lat),
        enable_triangulation=enable_triangulation,
    )
    generated["mode"] = "generate_area_synthetic_dataset"
    annotate_generation_result(
        generated,
        preview_id=preview_id,
        output_scope=output_scope,
        message=(
            "区域模拟数据已生成到 processed 目录并可刷新 SQLite。"
            if refresh_db
            else "区域模拟数据已生成到预览目录，尚未写入 SQLite。"
        ),
    )
    if refresh_db:
        generated["refresh"] = refresh_demo_database(processed_dir=output_dir)
    return success(generated, message="区域模拟数据生成完成。")


@router.post("/simulation/commit-preview")
def simulation_commit_preview(preview_id: str = Query(...)) -> dict:
    processed_dir = preview_dir_for(preview_id)
    if not processed_dir.exists():
        raise HTTPException(
            status_code=404,
            detail={"success": False, "data": None, "message": "预览批次不存在或已被清理。"},
        )

    result = refresh_demo_database(processed_dir=processed_dir)
    result["preview_id"] = preview_id
    result["source"] = "generated_preview"
    return success(result, message="预览数据已写入 SQLite。")


@router.post("/simulation/import")
async def simulation_import(
    network_metrics: UploadFile = File(...),
    base_stations: UploadFile | None = File(None),
    source_name: str = Form("external_upload"),
    batch_note: str = Form(""),
) -> dict:
    try:
        network_metrics_content = await network_metrics.read()
        base_stations_content = await base_stations.read() if base_stations else None
        result = import_external_network_data(
            network_metrics_content=network_metrics_content,
            network_metrics_filename=network_metrics.filename or "network_metrics.csv",
            source_name=source_name,
            batch_note=batch_note,
            base_stations_content=base_stations_content,
            base_stations_filename=base_stations.filename if base_stations else None,
            db_path=SIMULATION_IMPORT_DB_PATH,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"success": False, "data": None, "message": str(exc)}) from exc
    return success(result, message="外部网络数据导入完成。")
