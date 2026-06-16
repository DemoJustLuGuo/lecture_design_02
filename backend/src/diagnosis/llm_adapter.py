from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any


class LLMEnhancementError(RuntimeError):
    """Raised when the optional LLM diagnosis enhancement cannot be produced."""


@dataclass(frozen=True)
class LLMConfig:
    base_url: str
    api_key: str
    model: str
    timeout_seconds: float

    @classmethod
    def from_env(cls) -> "LLMConfig | None":
        api_key = os.getenv("LLM_API_KEY", "").strip()
        if not api_key:
            return None
        return cls(
            base_url=os.getenv("LLM_BASE_URL", "https://api.openai.com/v1").strip(),
            api_key=api_key,
            model=os.getenv("LLM_MODEL", "gpt-4o-mini").strip(),
            timeout_seconds=float(os.getenv("LLM_TIMEOUT_SECONDS", "20")),
        )

    @classmethod
    def from_payload(
        cls,
        *,
        api_key: str,
        base_url: str | None = None,
        model: str | None = None,
        timeout_seconds: float | None = None,
    ) -> "LLMConfig":
        clean_api_key = api_key.strip()
        if not clean_api_key:
            raise LLMEnhancementError("前端未填写大模型 API Key。")
        safe_timeout = timeout_seconds if timeout_seconds is not None else 20
        return cls(
            base_url=(base_url or "https://api.openai.com/v1").strip(),
            api_key=clean_api_key,
            model=(model or "gpt-4o-mini").strip(),
            timeout_seconds=max(1.0, min(float(safe_timeout), 60.0)),
        )

    @property
    def chat_completions_url(self) -> str:
        normalized = self.base_url.rstrip("/")
        if normalized.endswith("/chat/completions"):
            return normalized
        return f"{normalized}/chat/completions"


class OpenAICompatibleLLMClient:
    def __init__(self, config: LLMConfig | None = None):
        self.config = config if config is not None else LLMConfig.from_env()

    @property
    def model(self) -> str | None:
        return self.config.model if self.config else None

    def is_configured(self) -> bool:
        return self.config is not None

    def complete_json(self, messages: list[dict[str, str]]) -> dict[str, Any]:
        if self.config is None:
            raise LLMEnhancementError("LLM_API_KEY 未配置，已使用规则诊断结果。")

        payload = {
            "model": self.config.model,
            "messages": messages,
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
        }
        request = urllib.request.Request(
            self.config.chat_completions_url,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.config.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.config.timeout_seconds) as response:
                response_body = response.read().decode("utf-8")
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise LLMEnhancementError(f"大模型 API 调用失败：{exc}") from exc

        try:
            body = json.loads(response_body)
            content = body["choices"][0]["message"]["content"]
            parsed = json.loads(content)
        except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
            raise LLMEnhancementError("大模型返回内容不是合法的诊断 JSON。") from exc

        if not isinstance(parsed, dict):
            raise LLMEnhancementError("大模型返回内容不是 JSON 对象。")
        return parsed
