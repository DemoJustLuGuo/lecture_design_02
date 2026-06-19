from __future__ import annotations

from backend.src.models.localization_benchmark import run_synthetic_localization_benchmark


def test_synthetic_localization_meets_sub_50m_target_in_dense_urban() -> None:
    stats = run_synthetic_localization_benchmark(metric_count=1500, seed=42)
    assert stats is not None
    assert stats["track"] == "synthetic_algorithm"
    assert stats["count"] > 0
    # 密集城区场景下中位误差应稳定低于 50m 目标
    assert stats["median_m"] < 50.0
    assert stats["mean_m"] < 80.0
    for key in ("mean_m", "median_m", "p90_m", "max_m", "deployment", "solver"):
        assert key in stats


def test_benchmark_is_deterministic_for_fixed_seed() -> None:
    first = run_synthetic_localization_benchmark(metric_count=1200, seed=7)
    second = run_synthetic_localization_benchmark(metric_count=1200, seed=7)
    assert first["mean_m"] == second["mean_m"]
    assert first["median_m"] == second["median_m"]
