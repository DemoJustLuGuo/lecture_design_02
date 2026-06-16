from __future__ import annotations

from fastapi.testclient import TestClient

from backend.src.api.app import create_app
from backend.src.api.routes import diagnosis as diagnosis_route
from backend.src.database.db import DATABASE_PATH, get_connection
from backend.src.database.repository import Repository
from backend.src.diagnosis.llm_adapter import LLMEnhancementError
from backend.src.diagnosis.service import DiagnosisService


client = TestClient(create_app())


def insert_fault(fault_id: str, confidence: float | None = 0.91, level: str = "一般") -> None:
    with get_connection(DATABASE_PATH) as connection:
        connection.execute(
            """
            INSERT OR REPLACE INTO fault_logs (
              fault_id, source_dataset, scenario_id, station_id, detected_at,
              fault_type_raw, fault_type_cn, fault_level, confidence, affected_kpis,
              status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                fault_id,
                "unit",
                "unit",
                "UNIT_BS",
                "2026-06-16T10:00:00",
                "unit",
                "信道干扰",
                level,
                confidence,
                "sinr;ber;throughput_mbps",
                "未处理",
            ),
        )
        connection.commit()


def delete_fault(fault_id: str) -> None:
    with get_connection(DATABASE_PATH) as connection:
        connection.execute("DELETE FROM diagnosis_records WHERE fault_id = ?", (fault_id,))
        connection.execute("DELETE FROM fault_logs WHERE fault_id = ?", (fault_id,))
        connection.commit()


class FakeLLMClient:
    model = "mock-model"

    def __init__(self, result=None, error: Exception | None = None):
        self.result = result or {}
        self.error = error

    def complete_json(self, messages):
        if self.error:
            raise self.error
        assert messages[0]["role"] == "system"
        assert messages[1]["role"] == "user"
        return self.result


def test_llm_enhance_without_api_key_falls_back(monkeypatch) -> None:
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    fault_id = "TEST_LLM_NO_KEY"
    insert_fault(fault_id)
    try:
        body = client.get(f"/api/diagnosis/{fault_id}?enhance=llm").json()

        assert body["success"] is True
        display = body["data"]["display"]
        assert display["llm_enhanced"] is False
        assert display["llm_error"]
        assert display["root_cause"]
    finally:
        delete_fault(fault_id)


def test_llm_mock_success_merges_enhanced_display() -> None:
    fault_id = "TEST_LLM_SUCCESS"
    insert_fault(fault_id)
    try:
        service = DiagnosisService(
            Repository(),
            llm_client=FakeLLMClient(
                {
                    "root_cause": "SINR下降且BER升高，疑似同频干扰导致无线链路质量恶化。",
                    "key_symptoms": ["SINR低于正常区间", "BER升高", "吞吐量下降"],
                    "suggested_actions": [
                        {"title": "排查干扰源", "description": "结合频谱扫描和邻区关系确认同频或外部干扰。"}
                    ],
                    "affected_scope": "影响 UNIT_BS 覆盖区域内链路质量较差的用户。",
                    "review_required": True,
                    "review_reason": "干扰类故障需要结合现场频谱确认。",
                }
            ),
        )
        diagnosis = service.diagnosis_for_fault(fault_id, enhance="llm")

        assert diagnosis is not None
        display = diagnosis["display"]
        assert display["llm_enhanced"] is True
        assert display["llm_model"] == "mock-model"
        assert display["source_label"] == "大模型增强诊断"
        assert display["root_cause"].startswith("SINR下降")
        assert display["suggested_actions"][0]["title"] == "排查干扰源"
        assert display["review_required"] is True
    finally:
        delete_fault(fault_id)


def test_llm_mock_failure_falls_back_to_rule_display() -> None:
    fault_id = "TEST_LLM_FAILURE"
    insert_fault(fault_id)
    try:
        service = DiagnosisService(
            Repository(),
            llm_client=FakeLLMClient(error=LLMEnhancementError("bad json")),
        )
        diagnosis = service.diagnosis_for_fault(fault_id, enhance="llm")

        assert diagnosis is not None
        display = diagnosis["display"]
        assert display["llm_enhanced"] is False
        assert display["llm_error"] == "bad json"
        assert display["root_cause"]
        assert display["suggested_actions"]
    finally:
        delete_fault(fault_id)


def test_diagnosis_review_rules_survive_llm_enhancement() -> None:
    fault_id = "TEST_LLM_LOW_CONFIDENCE"
    insert_fault(fault_id, confidence=0.42, level="严重")
    try:
        service = DiagnosisService(
            Repository(),
            llm_client=FakeLLMClient(
                {
                    "root_cause": "模型增强说明。",
                    "key_symptoms": ["置信度偏低"],
                    "suggested_actions": [{"title": "复核", "description": "请人工确认。"}],
                    "affected_scope": "待确认。",
                    "review_required": False,
                    "review_reason": "大模型认为可自动处理。",
                }
            ),
        )
        diagnosis = service.diagnosis_for_fault(fault_id, enhance="llm")

        assert diagnosis is not None
        assert diagnosis["display"]["review_required"] is True
    finally:
        delete_fault(fault_id)


def test_diagnosis_not_found_shape() -> None:
    response = client.get("/api/diagnosis/not-exist?enhance=llm")

    assert response.status_code == 404
    assert response.json()["detail"]["success"] is False


def test_frontend_supplied_llm_config_api(monkeypatch) -> None:
    fault_id = "TEST_LLM_FRONTEND_CONFIG"
    insert_fault(fault_id)
    captured = {}

    class FakeDiagnosisService:
        def __init__(self, repository):
            self.repository = repository

        def diagnosis_for_fault_with_llm_config(self, fault_id, *, api_key, base_url=None, model=None, timeout_seconds=None):
            captured.update(
                {
                    "fault_id": fault_id,
                    "api_key": api_key,
                    "base_url": base_url,
                    "model": model,
                    "timeout_seconds": timeout_seconds,
                }
            )
            diagnosis = Repository().diagnosis_for_fault(fault_id)
            diagnosis["display"]["llm_enhanced"] = True
            diagnosis["display"]["llm_model"] = model
            return diagnosis

    monkeypatch.setattr(diagnosis_route, "DiagnosisService", FakeDiagnosisService)
    try:
        body = client.post(
            f"/api/diagnosis/{fault_id}/enhance",
            json={
                "base_url": "https://example.test/v1",
                "api_key": "demo-key",
                "model": "demo-model",
                "timeout_seconds": 9,
            },
        ).json()

        assert body["success"] is True
        assert body["data"]["display"]["llm_enhanced"] is True
        assert captured == {
            "fault_id": fault_id,
            "api_key": "demo-key",
            "base_url": "https://example.test/v1",
            "model": "demo-model",
            "timeout_seconds": 9.0,
        }
    finally:
        delete_fault(fault_id)
