from __future__ import annotations

import sqlite3
from pathlib import Path

from backend.src.utils.config import DATABASE_PATH, SCHEMA_PATH


def get_connection(db_path: Path = DATABASE_PATH) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_schema(db_path: Path = DATABASE_PATH) -> None:
    with get_connection(db_path) as connection:
        connection.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
