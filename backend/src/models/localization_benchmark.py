"""合成场景定位基准（课程主定位指标）。

公开 Kaggle 数据只有"路测点 vs 参考工参点"的代理误差，没有完整的定位算法链路。
本模块用 ``data_sim`` 生成带**已知真值**的合成场景，跑加权最小二乘三边定位，
统计"定位算法输出 vs 真值"的误差（均值/中位数/P90），作为题目要求的主定位口径。

可独立运行：

    python -m backend.src.models.localization_benchmark
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path
from typing import Any

from backend.src.models.evaluate import localization_error_stats


# 默认评估场景：约 3km×3km 城区密集部署，30 个基站（平均站间距 ~550m），
# 这是亚 50m 定位精度实际可达的典型场景。中心取北京坐标，仅用于经纬度尺度。
_CENTER_LON = 116.38
_CENTER_LAT = 39.9
_HALF_LON = 0.0175  # ≈ 3.0 km（经度方向）
_HALF_LAT = 0.0135  # ≈ 3.0 km（纬度方向）


def _dense_urban_bounds() -> tuple[float, float, float, float]:
    return (
        _CENTER_LON - _HALF_LON,
        _CENTER_LAT - _HALF_LAT,
        _CENTER_LON + _HALF_LON,
        _CENTER_LAT + _HALF_LAT,
    )


def run_synthetic_localization_benchmark(
    *,
    station_count: int = 30,
    metric_count: int = 3000,
    fault_ratio: float = 0.25,
    seed: int = 42,
    area_bounds: tuple[float, float, float, float] | None = None,
) -> dict[str, Any] | None:
    """生成合成场景并评估三边定位误差，返回统计字典。"""

    # 延迟导入，避免 models 与 data_sim 的包级循环依赖
    from backend.src.data_sim.synthetic_generator import generate_synthetic_processed_dataset

    bounds = area_bounds or _dense_urban_bounds()
    width_km = (bounds[2] - bounds[0]) * 85.4
    height_km = (bounds[3] - bounds[1]) * 111.3
    approx_spacing_m = (((width_km * height_km) / max(station_count, 1)) ** 0.5) * 1000

    with tempfile.TemporaryDirectory(prefix="loc_bench_") as tmp:
        output_dir = Path(tmp)
        generate_synthetic_processed_dataset(
            output_dir=output_dir,
            station_count=station_count,
            metric_count=metric_count,
            fault_ratio=fault_ratio,
            seed=seed,
            area_bounds=bounds,
            enable_triangulation=True,
        )
        stats = localization_error_stats(output_dir, track="synthetic_algorithm")

    if stats is not None:
        stats.update(
            {
                "station_count": station_count,
                "metric_count": metric_count,
                "fault_ratio": fault_ratio,
                "seed": seed,
                "solver": "weighted_least_squares_trilateration (≤5 anchors, dist/RSRP/SINR weighted)",
                "deployment": {
                    "scenario": "dense_urban",
                    "area_km": f"{width_km:.1f}x{height_km:.1f}",
                    "approx_cell_spacing_m": round(approx_spacing_m, 1),
                },
            }
        )
    return stats


def main() -> None:
    print(json.dumps(run_synthetic_localization_benchmark(), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
