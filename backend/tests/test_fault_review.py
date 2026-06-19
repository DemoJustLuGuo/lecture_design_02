from __future__ import annotations

from backend.src.models.fault_classifier import (
    LOW_CONFIDENCE_THRESHOLD,
    classify_faults,
    needs_review,
)


def test_needs_review_thresholding() -> None:
    assert needs_review(0.95) is False
    assert needs_review(0.40) is True
    assert needs_review(None) is True
    assert needs_review(LOW_CONFIDENCE_THRESHOLD - 0.01) is True
    assert needs_review(LOW_CONFIDENCE_THRESHOLD + 0.01) is False


def _record(metric_id: str, **kpis) -> dict:
    base = {
        "metric_id": metric_id, "source_dataset": "unit", "station_id": "BS_1", "cell_id": "1",
        "rsrp": -90, "sinr": 15, "ber": 0.002, "bler_dl": 0.01, "bler_ul": 0.01,
        "bandwidth_usage": 50, "rb_num": 100, "throughput_mbps": 200,
        "traffic_bytes": 25_000_000, "packet_count": 3000, "mcs": 18,
    }
    base.update(kpis)
    return base


def test_classify_output_carries_review_fields() -> None:
    result = classify_faults([_record("M1"), _record("M2", rsrp=-120, sinr=-3, ber=0.12)])

    assert result["review_threshold"] == LOW_CONFIDENCE_THRESHOLD
    assert "review_required_count" in result
    assert result["review_required_count"] == sum(
        1 for item in result["results"] if item["review_required"]
    )
    for item in result["results"]:
        assert isinstance(item["review_required"], bool)
        # 标记复核的样本必须给出理由，未标记的不给理由
        if item["review_required"]:
            assert item["review_reason"] and "复核" in item["review_reason"]
        else:
            assert item["review_reason"] is None
        # review_required 与 confidence/阈值一致
        assert item["review_required"] == needs_review(item["confidence"])
