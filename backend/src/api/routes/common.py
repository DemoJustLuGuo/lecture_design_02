from __future__ import annotations

from typing import Any

from fastapi import HTTPException


def success(data: Any, message: str = "") -> dict[str, Any]:
    return {"success": True, "data": data, "message": message}


def not_found(message: str) -> None:
    raise HTTPException(status_code=404, detail={"success": False, "data": None, "message": message})
