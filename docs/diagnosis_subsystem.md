# 诊断子系统说明

> 本文档描述故障诊断子系统：以**规则引擎为稳定兜底**，**大模型(LLM)为可选增强层**。
> 覆盖 `backend/src/diagnosis/{rules,service,llm_adapter}.py` 与诊断接口，供课程报告
> "核心算法-诊断"与"创新点"章节引用。

## 1. 定位与原则

- 诊断**不替代**异常检测、故障分类、定位计算，只在其结果之上生成面向运维的建议。
- **规则引擎是稳定兜底**：离线可用、确定性、适合课程演示。
- **LLM 是增强层**：未配置或调用失败时自动回退规则诊断，演示不依赖外部网络。
- 输入/输出保持结构化，便于前端展示与报告引用。

```text
故障(fault_logs) + 关键KPI + 定位 + 基站 -> 规则诊断(兜底) -> [可选 LLM 增强] -> 结构化 display
```

## 2. 规则引擎（`rules.py`）

### 2.1 故障类型规则库 `FAULT_RULES`

为 6 类（5 故障 + `未分类异常`）各定义：`root_cause`（根因）、`key_symptoms`（症状）、
`actions`（`title`+`description` 列表）、`affected_scope`（影响范围）、
`default_review_required`（默认是否复核）、`review_reason`（复核理由）。

| 故障类型 | 根因要点 | 默认复核 |
| --- | --- | --- |
| 信号中断/覆盖退化 | 功率/天馈/弱覆盖/切换边界 | 否 |
| 误码过高 | 射频链路退化/干扰/信号质量 | 否 |
| 带宽不足 | 资源/容量瓶颈，PRB 高占用 | 否 |
| 基站故障 | 硬件/天馈/射频/移动性异常，多指标同劣化 | 是 |
| 信道干扰 | 同频重叠/PCI 冲突/外部干扰/多普勒 | 是 |
| 未分类异常 | 仅异常检测命中、尚未分类 | 是 |

### 2.2 类型匹配 `rule_for_fault_type`

精确命中优先；否则按关键词回退（含"覆盖/信号"、"误码"、"带宽/容量/拥塞"、
"基站/天线/切换"、"干扰/信道/PCI"），全不中 → `未分类异常`。保证任意输入都有兜底规则。

### 2.3 展示组装 `build_diagnosis_display`

输出统一 `display` 结构：

| 字段 | 来源 |
| --- | --- |
| `fault_type` | 故障类型 |
| `source_label` | 固定"规则诊断" |
| `root_cause` / `affected_scope` | 优先用库内中文文本；存储文本非中文时回退规则文本（`is_chinese_text` 判定） |
| `key_symptoms` | 规则库症状列表 |
| `suggested_actions` | 规则库动作列表（`title`+`description`） |
| `evidence` | 受影响 KPI（经 `KPI_LABELS` 中文化）、关联基站、模型置信度%、定位误差 |
| `review_required` / `review_reason` | 见 §2.4 |
| `llm_enhanced` / `llm_model` | 规则诊断为 `False` / `None` |

### 2.4 人工复核判定 `_review_reason`（诊断级）

按优先级置 `review_required=True`：
1. 故障类型为 `未分类异常`（仅检测未分类）；
2. 置信度 < **80%**（`LOW_CONFIDENCE_THRESHOLD=0.8`）；
3. 故障等级为"严重"；
4. 诊断记录或规则默认要求复核。
否则不需复核，提示按建议处理并观察恢复。

> 注意两处不同阈值：分类阶段 `fault_classifier.LOW_CONFIDENCE_THRESHOLD=0.6`（推理时标记
> 低置信度，见 [`model_layer_and_detection.md`](./model_layer_and_detection.md)）；诊断阶段
> `rules.LOW_CONFIDENCE_THRESHOLD=0.8`（展示时是否提示人工复核）。两者面向不同环节，互补。

## 3. 诊断服务（`service.py`）

`DiagnosisService` 组合故障、指标、定位、规则诊断与可选 LLM 增强。

| 方法 | 用途 |
| --- | --- |
| `diagnosis_for_fault(fault_id, enhance=None)` | 取规则诊断；`enhance="llm"` 时用后端环境变量配置尝试增强 |
| `diagnosis_for_fault_with_llm_config(fault_id, api_key, base_url, model, timeout)` | 用前端传入配置触发增强 |
| `_build_llm_context(diagnosis)` | 构造结构化上下文：`data_collection_fields`、`diagnosis_priority`、`fault`、`base_station`、`recent_network_metrics`(最近5条)、`rule_diagnosis` |
| `_merge_llm_display(display, llm_result)` | 将 LLM 输出合并进 display（非空才覆盖），标记 `source_label=大模型增强诊断`、`llm_enhanced=True` |

失败处理：`_enhance_with_llm` 捕获 `LLMEnhancementError`，置 `llm_enhanced=False` 与
`llm_error`，**保留规则诊断结果**返回。

## 4. LLM 适配器（`llm_adapter.py`）

- `LLMConfig.from_env()`：读 `LLM_API_KEY`（必需）、`LLM_BASE_URL`（默认 OpenAI v1）、
  `LLM_MODEL`（默认 `gpt-4o-mini`）、`LLM_TIMEOUT_SECONDS`（默认 20）；无 key 返回 `None`。
- `LLMConfig.from_payload(...)`：前端配置，超时夹在 [1,60]s，缺 key 抛 `LLMEnhancementError`。
- `OpenAICompatibleLLMClient.complete_json(messages)`：POST `{base_url}/chat/completions`，
  `temperature=0.2`、`response_format=json_object`；网络/解析/非对象错误统一抛
  `LLMEnhancementError`（→ 上层回退规则）。

### 4.1 结构化输出契约

System Prompt 要求 LLM 只依据传入结构化 JSON 增强、不得编造，输出字段固定：

| 字段 | 含义 |
| --- | --- |
| `root_cause` | 根因分析 |
| `key_symptoms` | 关键症状（字符串数组） |
| `suggested_actions` | 处理建议（`title`+`description` 对象数组） |
| `affected_scope` | 影响范围 |
| `review_required` | 是否需人工复核 |
| `review_reason` | 复核理由 |

## 5. 接口

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/diagnosis/{fault_id}` | GET | 规则诊断（默认） |
| `/api/diagnosis/{fault_id}?enhance=llm` | GET | 用后端环境变量尝试 LLM 增强 |
| `/api/diagnosis/{fault_id}/enhance` | POST | 用前端配置（body: `api_key`/`base_url`/`model`/`timeout_seconds`）触发增强 |

详见 [`api_reference.md`](./api_reference.md)。

## 6. 安全说明

前端设置页将 `api_key` 存于浏览器 `localStorage`，仅用于课程演示；真实工程应由后端代管
密钥并配合鉴权与审计，不应落入浏览器存储。

## 7. 前端展示

诊断页 `frontend/src/pages/Diagnosis.tsx` 展示规则诊断与 LLM 增强结果，支持触发增强、
采纳建议（更新故障状态）、导出 Markdown 诊断报告。详见
[`frontend_pages.md`](./frontend_pages.md)。
