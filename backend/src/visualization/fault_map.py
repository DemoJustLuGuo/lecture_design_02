"""故障地图静态图生成。

用于报告插图：在经纬度平面上绘制基站位置与故障点位置。
前端的交互式地图由 Leaflet 实现；本模块只产出可写入报告的静态 PNG。
"""

from __future__ import annotations

from pathlib import Path

import matplotlib
import pandas as pd

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

_CN_FONT = "SimHei"


def plot_fault_map(
    stations: pd.DataFrame,
    faults: pd.DataFrame,
    output_path: Path,
    lon_col: str = "longitude",
    lat_col: str = "latitude",
) -> Path:
    """绘制基站（蓝点）与故障点（红叉）分布图。"""

    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig, ax = plt.subplots(figsize=(8, 7))
    if not stations.empty and {lon_col, lat_col}.issubset(stations.columns):
        ax.scatter(
            pd.to_numeric(stations[lon_col], errors="coerce"),
            pd.to_numeric(stations[lat_col], errors="coerce"),
            c="#2f6f9f",
            marker="o",
            s=40,
            label="基站",
            alpha=0.8,
        )
    if not faults.empty and {lon_col, lat_col}.issubset(faults.columns):
        ax.scatter(
            pd.to_numeric(faults[lon_col], errors="coerce"),
            pd.to_numeric(faults[lat_col], errors="coerce"),
            c="#d6453d",
            marker="x",
            s=60,
            label="故障点",
        )
    ax.set_xlabel("经度", fontproperties=_CN_FONT)
    ax.set_ylabel("纬度", fontproperties=_CN_FONT)
    ax.set_title("基站与故障位置分布", fontproperties=_CN_FONT)
    if ax.get_legend_handles_labels()[0]:
        ax.legend(prop={"family": _CN_FONT})
    ax.grid(True, linestyle="--", alpha=0.3)
    fig.tight_layout()
    fig.savefig(output_path, dpi=160)
    plt.close(fig)
    return output_path


def plot_fault_map_from_processed(processed_dir: Path, output_path: Path) -> Path:
    """从 processed 目录的 CSV 读取基站与故障坐标并生成地图。"""

    stations_path = processed_dir / "base_stations.csv"
    faults_path = processed_dir / "fault_samples.csv"
    stations = (
        pd.read_csv(stations_path, encoding="utf-8-sig", low_memory=False)
        if stations_path.exists()
        else pd.DataFrame()
    )
    faults = (
        pd.read_csv(faults_path, encoding="utf-8-sig", low_memory=False)
        if faults_path.exists()
        else pd.DataFrame()
    )
    return plot_fault_map(stations, faults, output_path)
