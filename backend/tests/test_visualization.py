from __future__ import annotations

from pathlib import Path

import pandas as pd

from backend.src.visualization.charts import (
    plot_confusion_matrix,
    plot_localization_error_distribution,
)
from backend.src.visualization.fault_map import plot_fault_map


def test_plot_confusion_matrix_writes_nonempty_png(tmp_path: Path) -> None:
    out = tmp_path / "cm.png"
    plot_confusion_matrix(["正常", "信道干扰"], [[10, 1], [2, 8]], out)
    assert out.exists() and out.stat().st_size > 0


def test_plot_localization_error_distribution_writes_nonempty_png(tmp_path: Path) -> None:
    out = tmp_path / "loc.png"
    plot_localization_error_distribution([5.0, 12.0, 30.0, 8.0, 19.0], out)
    assert out.exists() and out.stat().st_size > 0


def test_plot_fault_map_writes_nonempty_png(tmp_path: Path) -> None:
    out = tmp_path / "map.png"
    stations = pd.DataFrame(
        {"longitude": [120.0, 120.1], "latitude": [30.0, 30.1]}
    )
    faults = pd.DataFrame({"longitude": [120.05], "latitude": [30.05]})
    plot_fault_map(stations, faults, out)
    assert out.exists() and out.stat().st_size > 0


def test_plot_fault_map_tolerates_empty_frames(tmp_path: Path) -> None:
    out = tmp_path / "empty_map.png"
    plot_fault_map(pd.DataFrame(), pd.DataFrame(), out)
    assert out.exists() and out.stat().st_size > 0
