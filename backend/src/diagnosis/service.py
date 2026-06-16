from __future__ import annotations

import copy
import json
from typing import Any

from backend.src.diagnosis.llm_adapter import LLMConfig, LLMEnhancementError, OpenAICompatibleLLMClient


DATA_COLLECTION_FIELDS = {
    "base_station": [
        "station_id",
        "gnodeb_id",
        "cell_id",
        "pci",
        "longitude",
        "latitude",
        "height",
        "azimuth",
        "downtilt",
        "tx_power",
        "status",
    ],
    "network_metrics": [
        "timestamp",
        "rsrp",
        "sinr",
        "ber",
        "bler_dl",
        "bler_ul",
        "bandwidth_usage",
        "rb_num",
        "throughput_mbps",
        "traffic_bytes",
        "packet_count",
        "mcs",
    ],
    "fault_result": [
        "fault_type_cn",
        "fault_level",
        "confidence",
        "affected_kpis",
        "is_fault",
    ],
    "location": [
        "fault_longitude",
        "fault_latitude",
        "truth_longitude",
        "truth_latitude",
        "localization_error_m",
    ],
    "diagnosis_knowledge": [
        "root_cause",
        "suggested_actions",
        "affected_scope",
        "review_required",
    ],
}


SYSTEM_PROMPT = """你是通信网络运维故障诊断助手。你只能根据用户提供的结构化 JSON 进行诊断增强，不得编造未提供的现场告警、工单、人名、设备序列号或测试结果。
输出必须是 JSON 对象，字段为 root_cause、key_symptoms、suggested_actions、affected_scope、review_required、review_reason。
suggested_actions 必须是对象数组，每个对象包含 title 和 description。诊断要优先解释通信 KPI 的异常方向，例如 RSRP 低、SINR 低、BER/BLER 高、PRB/RB 紧张、吞吐下降。"""


class DiagnosisService:
    def __init__(self, repository: Any, llm_client: OpenAICompatibleLLMClient | None = None):
        self.repository = repository
        self.llm_client = llm_client if llm_client is not None else OpenAICompatibleLLMClient()

    def diagnosis_for_fault(self, fault_id: str, enhance: str | None = None) -> dict[str, Any] | None:
        diagnosis = self.repository.diagnosis_for_fault(fault_id)
        if diagnosis is None:
            return None
        diagnosis.setdefault("collection_fields", DATA_COLLECTION_FIELDS)
        display = diagnosis.get("display") or {}
        display.setdefault("llm_enhanced", False)
        display.setdefault("llm_model", None)
        diagnosis["display"] = display

        if enhance != "llm":
            return diagnosis
        return self._enhance_with_llm(diagnosis)

    def diagnosis_for_fault_with_llm_config(
        self,
        fault_id: str,
        *,
        api_key: str,
        base_url: str | None = None,
        model: str | None = None,
        timeout_seconds: float | None = None,
    ) -> dict[str, Any] | None:
        diagnosis = self.repository.diagnosis_for_fault(fault_id)
        if diagnosis is None:
            return None
        diagnosis.setdefault("collection_fields", DATA_COLLECTION_FIELDS)
        diagnosis["display"] = diagnosis.get("display") or {}
        client = OpenAICompatibleLLMClient(
            LLMConfig.from_payload(
                api_key=api_key,
                base_url=base_url,
                model=model,
                timeout_seconds=timeout_seconds,
            )
        )
        return DiagnosisService(self.repository, llm_client=client)._enhance_with_llm(diagnosis)

    def _enhance_with_llm(self, diagnosis: dict[str, Any]) -> dict[str, Any]:
        enhanced = copy.deepcopy(diagnosis)
        display = enhanced.get("display") or {}
        try:
            context = self._build_llm_context(enhanced)
            llm_result = self.llm_client.complete_json(
                [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": json.dumps(context, ensure_ascii=False, indent=2)},
                ]
            )
            enhanced["display"] = self._merge_llm_display(display, llm_result)
        except LLMEnhancementError as exc:
            display["llm_enhanced"] = False
            display["llm_model"] = self.llm_client.model
            display["llm_error"] = str(exc)
            enhanced["display"] = display
        return enhanced

    def _build_llm_context(self, diagnosis: dict[str, Any]) -> dict[str, Any]:
        fault = diagnosis.get("fault") or {}
        station = self._station_context(fault.get("station_id"))
        display = diagnosis.get("display") or {}
        return {
            "data_collection_fields": DATA_COLLECTION_FIELDS,
            "diagnosis_priority": [
                "先看故障类型和置信度，判断是否需要人工复核",
                "再看关键 KPI 异常方向，例如 RSRP、SINR、BER/BLER、PRB/RB、吞吐量",
                "再结合基站状态、位置和定位误差判断影响范围",
                "最后输出根因分析、处理建议、影响范围和复核理由",
            ],
            "fault": {
                key: fault.get(key)
                for key in [
                    "fault_id",
                    "source_dataset",
                    "scenario_id",
                    "station_id",
                    "detected_at",
                    "fault_type_cn",
                    "fault_level",
                    "confidence",
                    "affected_kpis",
                    "fault_longitude",
                    "fault_latitude",
                    "truth_longitude",
                    "truth_latitude",
                    "localization_error_m",
                    "diagnosis_text",
                    "status",
                ]
            },
            "base_station": station.get("base_station"),
            "recent_network_metrics": station.get("recent_metrics", []),
            "rule_diagnosis": {
                "root_cause": display.get("root_cause") or diagnosis.get("root_cause"),
                "key_symptoms": display.get("key_symptoms") or [],
                "suggested_actions": display.get("suggested_actions") or diagnosis.get("suggested_actions"),
                "affected_scope": display.get("affected_scope") or diagnosis.get("affected_scope"),
                "review_required": display.get("review_required"),
                "review_reason": display.get("review_reason"),
            },
        }

    def _station_context(self, station_id: str | None) -> dict[str, Any]:
        if not station_id or not hasattr(self.repository, "get_station"):
            return {"base_station": None, "recent_metrics": []}
        station = self.repository.get_station(station_id)
        if not station:
            return {"base_station": None, "recent_metrics": []}
        station_copy = dict(station)
        recent_metrics = station_copy.pop("recent_metrics", [])[-5:]
        station_copy.pop("recent_faults", None)
        return {"base_station": station_copy, "recent_metrics": recent_metrics}

    def _merge_llm_display(self, display: dict[str, Any], llm_result: dict[str, Any]) -> dict[str, Any]:
        merged = dict(display)
        root_cause = self._non_empty_string(llm_result.get("root_cause"))
        affected_scope = self._non_empty_string(llm_result.get("affected_scope"))
        review_reason = self._non_empty_string(llm_result.get("review_reason"))
        key_symptoms = self._string_list(llm_result.get("key_symptoms"))
        suggested_actions = self._action_list(llm_result.get("suggested_actions"))

        if root_cause:
            merged["root_cause"] = root_cause
        if affected_scope:
            merged["affected_scope"] = affected_scope
        if review_reason:
            merged["review_reason"] = review_reason
        if key_symptoms:
            merged["key_symptoms"] = key_symptoms
        if suggested_actions:
            merged["suggested_actions"] = suggested_actions

        merged["review_required"] = bool(display.get("review_required")) or bool(llm_result.get("review_required"))
        merged["source_label"] = "大模型增强诊断"
        merged["llm_enhanced"] = True
        merged["llm_model"] = self.llm_client.model
        merged["llm_error"] = None
        return merged

    @staticmethod
    def _non_empty_string(value: Any) -> str | None:
        if isinstance(value, str) and value.strip():
            return value.strip()
        return None

    @staticmethod
    def _string_list(value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        return [item.strip() for item in value if isinstance(item, str) and item.strip()]

    @staticmethod
    def _action_list(value: Any) -> list[dict[str, str]]:
        if not isinstance(value, list):
            return []
        actions: list[dict[str, str]] = []
        for item in value:
            if not isinstance(item, dict):
                continue
            title = item.get("title")
            description = item.get("description")
            if isinstance(title, str) and title.strip() and isinstance(description, str) and description.strip():
                actions.append({"title": title.strip(), "description": description.strip()})
        return actions
