from __future__ import annotations

import numpy as np
import pandas as pd

from backend.src.models.anomaly_detector import (
    detect_anomalies,
    fuse_scores,
    normalize_if_scores,
    rule_anomaly_score,
)


def test_rule_score_higher_for_degraded_than_healthy() -> None:
    frame = pd.DataFrame(
        [
            {"rsrp": -80, "sinr": 22, "ber": 0.001, "bler_dl": 0.01, "bler_ul": 0.01,
             "bandwidth_usage": 40, "throughput_mbps": 300, "mcs": 20},
            {"rsrp": -120, "sinr": -3, "ber": 0.12, "bler_dl": 0.2, "bler_ul": 0.2,
             "bandwidth_usage": 98, "throughput_mbps": 2, "mcs": 2},
        ]
    )
    scores = rule_anomaly_score(frame)
    assert scores[0] < 0.2
    assert scores[1] > 0.8


def test_fuse_scores_is_weighted_sum() -> None:
    weights = {"supervised": 0.6, "rule": 0.3, "isolation_forest": 0.1}
    fused = fuse_scores(np.array([1.0]), np.array([0.0]), np.array([1.0]), weights)
    assert abs(float(fused[0]) - (0.6 * 1.0 + 0.3 * 0.0 + 0.1 * 1.0)) < 1e-9


def test_normalize_if_scores_clips_to_unit_interval() -> None:
    out = normalize_if_scores(np.array([-5.0, 0.0, 5.0, 50.0]), if_min=0.0, if_max=10.0)
    assert out.min() >= 0.0 and out.max() <= 1.0
    assert abs(out[1] - 0.0) < 1e-9


def _record(rsrp, sinr, ber, bw, thr, mcs) -> dict:
    return {
        "metric_id": "M", "source_dataset": "unit", "rsrp": rsrp, "sinr": sinr,
        "ber": ber, "bler_dl": ber, "bler_ul": ber, "bandwidth_usage": bw,
        "rb_num": 100, "throughput_mbps": thr, "traffic_bytes": thr * 125000,
        "packet_count": 3000, "mcs": mcs,
    }


def test_detect_anomalies_smoke_degraded_scores_higher() -> None:
    healthy = _record(-80, 22, 0.001, 40, 300, 20)
    degraded = _record(-122, -4, 0.13, 98, 1.5, 2)
    result = detect_anomalies([healthy, degraded])

    assert result["sample_count"] == 2
    assert "fusion_weights" in result
    assert len(result["results"]) == 2
    for item in result["results"]:
        assert {"supervised", "rule", "isolation_forest"} <= item["sub_scores"].keys()
    # 明显劣化样本的融合异常分应高于健康样本
    assert result["results"][1]["anomaly_score"] > result["results"][0]["anomaly_score"]
    assert result["results"][1]["is_anomaly"] is True
