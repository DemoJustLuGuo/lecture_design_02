# 最新开发状态与报告素材记录

更新时间：2026-06-18

## 1. 文档用途

本文档用于记录当前源码工程的最新开发状态，重点服务课程设计报告、答辩 PPT 和演示脚本。它不是详细开发规范，而是阶段进度、功能闭环、测试验证和后续待补项的索引。

当前系统已经从“后端接口 + 前端联调”推进到“诊断增强、设置页、数据管理和 P0 交互补齐”阶段。报告中描述系统实现状态时，应以本文档和各阶段文档共同作为依据。

## 2. 当前 Git 进度

最近关键提交如下：

| 提交 | 说明 |
| --- | --- |
| `d8aa9d6 add llm-enhanced diagnosis` | 新增大模型增强诊断后端适配、结构化诊断合并和相关测试 |
| `7f547b9 add settings data management page` | 新增设置页，支持前端配置大模型 API 和数据管理操作 |
| `98ffb53 complete p0 remediation items` | 补齐诊断页真实动作、运行错误提示、启动脚本，并清理 Vue 遗留产物 |

这些提交对应的报告价值：

1. 证明系统具备可扩展的 AI 诊断建议增强能力。
2. 证明前端可直接配置演示用大模型 API，便于课程答辩现场配置。
3. 证明诊断建议不是静态展示，已经能关联故障处理状态和报告导出。
4. 证明前端工程已统一为 React 技术栈，减少 Vue 旧工程残留。

## 3. 当前功能闭环

当前运行态 SQLite 数据库保持为空白演示状态，用于展示系统“从未输入数据到导入/生成数据，再完成分析诊断”的完整流程。空库状态下核心表行数如下：

| 表名 | 当前行数 |
| --- | ---: |
| `base_stations` | 0 |
| `network_metrics` | 0 |
| `fault_logs` | 0 |
| `diagnosis_records` | 0 |
| `model_evaluations` | 0 |
| `data_import_batches` | 0 |
| `data_import_errors` | 0 |

需要区分：`backend/data/processed/`、`backend/saved_models/` 和 `backend/reports/` 仍保留阶段成果数据、模型和评估素材；`backend/data/app.db` 是当前演示运行态数据库，可为空，也可通过设置页重新写入数据。

当前系统主流程为：

```text
通信网络数据/模拟数据
-> 特征工程
-> 异常检测
-> 故障分类
-> 故障定位
-> 规则诊断
-> 可选大模型增强诊断
-> 故障日志、地图、模型评估和诊断页面展示
-> 运维处理状态更新与报告导出
```

当前可演示能力：

| 能力 | 当前状态 | 报告可用说明 |
| --- | --- | --- |
| 数据接入与模拟 | 已完成 | 生成并接入基站、网络指标、故障样本和诊断知识数据 |
| 异常检测 | 已完成 | 使用 IsolationForest 输出异常判断和评估指标 |
| 故障分类 | 已完成 | 使用 RandomForest 输出故障类型和置信度 |
| 故障定位 | 已完成 | 输出故障坐标、真实坐标和定位误差 |
| 规则诊断 | 已完成 | 根据故障类型、置信度、KPI 和定位信息生成建议 |
| 大模型增强诊断 | 已完成 | 支持 OpenAI 兼容 API，作为规则诊断的增强层 |
| 前端管理系统 | 已完成 | 覆盖总览、基站、故障、地图、诊断、评估、移动预警、设置页 |
| 数据管理 | 已完成基础能力 | 可在设置页刷新 SQLite、生成合成数据、导入外部 CSV |
| 运维交互 | 已补齐 P0 | 诊断页支持采纳建议、更新故障状态和导出诊断报告 |

## 4. 大模型增强诊断实现状态

大模型能力定位为“诊断建议增强层”，不替代异常检测、故障分类、定位计算和规则库。默认规则诊断仍是稳定兜底，适合课程设计离线演示。

后端实现：

| 文件 | 作用 |
| --- | --- |
| `backend/src/diagnosis/llm_adapter.py` | OpenAI 兼容接口适配，要求输入和输出均为结构化 JSON |
| `backend/src/diagnosis/service.py` | 组合故障、指标、定位、规则诊断和可选 LLM 增强结果 |
| `backend/src/api/routes/diagnosis.py` | 提供规则诊断和大模型增强诊断接口 |

接口状态：

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/diagnosis/{fault_id}` | GET | 默认返回规则诊断 |
| `/api/diagnosis/{fault_id}?enhance=llm` | GET | 使用环境变量配置尝试大模型增强 |
| `/api/diagnosis/{fault_id}/enhance` | POST | 使用前端传入配置主动触发大模型增强 |

前端实现：

| 文件 | 作用 |
| --- | --- |
| `frontend/src/pages/Diagnosis.tsx` | 诊断页展示规则诊断和大模型增强结果，支持按钮触发增强 |
| `frontend/src/pages/Settings.tsx` | 设置页保存演示用 LLM 配置 |
| `frontend/src/utils/llmConfig.ts` | 读取、校验和保存前端 LLM 配置 |
| `frontend/public/llm-config.example.json` | 演示配置示例 |

配置方式：

1. 后端环境变量仍支持 `LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL`、`LLM_TIMEOUT_SECONDS`。
2. 前端设置页支持直接配置 `base_url`、`api_key`、`model` 和超时时间。
3. 本地演示配置文件 `frontend/public/llm-config.local.json` 已加入 `.gitignore`，不会被提交。

> 安全说明：前端 `api_key` 保存在浏览器 `localStorage` 仅限课程演示。真实工程中
> 密钥应由后端代管并配合鉴权与审计，不应落入浏览器存储。报告中应据实说明这一点。

## 5. 设置页和数据管理状态

设置页新增后，系统配置入口更加集中，便于答辩时说明“系统参数配置”和“演示数据管理”。

当前设置页能力：

| 功能 | 当前状态 |
| --- | --- |
| 演示流程状态 | 已完成，可根据空库、预览批次、故障日志、模型评估和 LLM 配置给出演示步骤提示 |
| 大模型 API 配置 | 已完成，配置保存在浏览器 localStorage |
| 默认演示数据刷新 | 已完成，调用 `/api/simulation/run` |
| 合成演示数据生成 | 已完成，调用 `/api/simulation/generate` |
| 外部 CSV 导入 | 已完成基础能力，调用 `/api/simulation/import` |
| CSV 字段模板 | 已完成，见 `docs/data_import_template.md` 和 `frontend/public/templates/` |
| 生成后写入 SQLite | 已完成，支持确认写入预览数据 |

需要在报告中注意：外部 CSV 导入属于演示增强能力，真实工程中需要更严格的数据校验、权限控制和导入审计；课程设计阶段主要用于说明系统具备数据源替换和扩展能力。

## 6. P0 修复状态

本轮 P0 重点补齐“看起来有按钮但实际不可操作”的问题，以及“数据加载失败时定位困难”的问题。

已完成项：

| P0 项 | 当前状态 | 说明 |
| --- | --- | --- |
| 采纳建议 | 已完成 | 诊断页可将未处理故障更新为“处理中” |
| 导出报告 | 已完成 | 诊断页可导出 Markdown 格式诊断报告 |
| 数据加载失败提示 | 已完成 | Axios 层区分后端未启动、代理失败、超时和网络异常 |
| 启动脚本 | 已完成 | 新增 `scripts/start_backend.ps1` 和 `scripts/start_frontend.ps1` |
| 健康检查脚本 | 已完成 | 新增 `scripts/health_check.ps1` |
| Vue 遗留清理 | 已完成 | 删除旧 `.vue` 页面、Vue router、Pinia store 和 Vue/Vite 示例资源 |
| 空库页面引导 | 已完成 | 主要页面在无数据时提示前往设置页导入/生成数据 |
| 测试空库适配 | 已完成 | API 测试改为自造最小样本，不依赖当前 `app.db` 已有数据 |

## 7. P1 推进状态

本轮 P1 优先补齐答辩演示和报告引用最需要的内容。

已完成项：

| P1 项 | 当前状态 | 说明 |
| --- | --- | --- |
| 设置页演示流程状态 | 已完成 | 设置页显示运行态数据库、数据准备、故障分析、模型评估和 AI 增强状态，并给出下一步动作 |
| 数据操作后状态刷新 | 已完成 | 重载、预览写入和 CSV 导入成功后自动刷新设置页系统状态 |
| 完整运行说明 | 已完成 | 新增 `docs/run_and_demo_guide.md`，覆盖启动、健康检查、空库演示、数据写入和 LLM 配置 |
| API 文档表 | 已完成 | 新增 `docs/api_reference.md`，按实际 FastAPI 路由整理接口、参数和前端页面关系 |

仍待阶段五补充：

| 项目 | 说明 |
| --- | --- |
| 最新页面截图 | 需要在前后端服务启动后保存空白状态、设置页、AI 增强诊断、导出报告等截图，用于报告和 PPT |
| 演示视频脚本 | 可基于 `docs/run_and_demo_guide.md` 扩写为逐帧讲解稿 |

## 8. P2 推进状态

本轮 P2 重点处理工程质量和报告支撑材料。

已完成项：

| P2 项 | 当前状态 | 说明 |
| --- | --- | --- |
| Vite 大 chunk 优化 | 已完成 | 使用 `build.rolldownOptions.output.manualChunks` 拆分 React、Router、Axios、Leaflet、ECharts；ECharts 改为按需注册图表和组件 |
| 构建告警处理 | 已完成 | `vendor-echarts` 从约 1.1 MB 降至约 555 KB，gzip 约 188 KB；阈值调整为 600 KB 后构建无大 chunk warning |
| 外部 CSV 字段模板 | 已完成 | 新增 `network_metrics_template.csv`、`base_stations_template.csv` 和 `docs/data_import_template.md` |
| 设置页模板入口 | 已完成 | 导入区提供指标模板和基站模板下载，并支持可选基站 CSV 随同导入 |
| 前端演示资产校验 | 已完成 | 新增 `npm run validate:demo`，校验 LLM 示例配置、CSV 模板、路由懒加载和 Vite 分包配置 |

## 9. 当前验证结果

最近一次验证命令：

```powershell
cd D:\CODE\lesson_design_02\main\lecture_design_02
python -m pytest backend/tests
```

结果：

```text
49 passed
```

前端构建：

```powershell
cd D:\CODE\lesson_design_02\main\lecture_design_02\frontend
npm run validate:demo
npm run build
```

结果：

```text
Demo asset validation passed.
tsc -b && vite build
✓ built
```

构建已不再出现 Vite 大 chunk warning。当前最大业务相关依赖块为独立的 `vendor-echarts`，约 555 KB，gzip 后约 188 KB。

测试和构建后，当前运行态 SQLite 仍保持空白演示状态：

| 表名 | 当前行数 |
| --- | ---: |
| `base_stations` | 0 |
| `network_metrics` | 0 |
| `fault_logs` | 0 |
| `diagnosis_records` | 0 |
| `model_evaluations` | 0 |
| `data_import_batches` | 0 |
| `data_import_errors` | 0 |

## 10. 报告可直接引用的进度描述

可在报告“系统实现”或“阶段性成果”中使用以下描述：

```text
截至当前阶段，系统已经完成通信网络数据接入、异常检测、故障分类、故障定位、规则诊断、日志统计、地图展示、模型评估和前端管理界面的完整闭环。在诊断模块中，系统将大模型 API 定位为规则诊断后的增强层，通过 OpenAI 兼容接口接收结构化故障数据并返回结构化诊断建议。当大模型未配置或调用失败时，系统自动回退到规则诊断结果，保证课程设计演示不依赖外部网络。前端设置页支持配置大模型 API、查看演示流程状态、刷新 SQLite 演示数据、生成合成数据、下载 CSV 模板并导入外部数据；诊断页支持 AI 增强诊断、采纳建议、故障状态更新和 Markdown 报告导出。当前前端工程已统一为 React + Vite + Tailwind 技术栈，清理了 Vue 旧工程遗留文件，并通过 Vite 分包和 ECharts 按需注册降低了构建体积警告风险。
```

## 11. 当前待补项

后续优先级建议：

| 优先级 | 待补项 | 原因 |
| --- | --- | --- |
| P1 | 保存最新页面截图 | 报告和 PPT 需要展示空白初始状态、设置页、AI 增强诊断和报告导出能力 |
| P3 | 增加真实浏览器截图回归 | 可进一步验证关键页面在不同尺寸下的展示效果 |
| P3 | 完善演示视频逐字稿 | 便于后续录屏和答辩排练 |

## 12. 模型层与故障检测升级（M1–M5）

模型层已完成一轮系统性优化，权威说明见 [`model_layer_and_detection.md`](./model_layer_and_detection.md)。

| 项 | 升级内容 | 关键结果（`seed=42`） |
| --- | --- | --- |
| 评估口径 | 按 `scenario_id` 分组切分防泄漏；保留随机切分对照；耗时区分训练/单批推理 | 量化泄漏：分类随机 0.99 → 分组 CV 0.51±0.21 |
| 异常检测 | 监督 RF 主通道 + 规则 + IsolationForest 三通道融合；检测特征去高基数类别 | in-dist 0.986（旧 IF 0.847），达成 ≥95% |
| 故障分类 | 输出置信度，低置信度（<0.6）标记人工复核 | 复核占比 2.15%，平均置信度 0.855 |
| 故障定位 | 加权最小二乘三边定位（≤5 锚点、退化保护）；合成真值为主口径，Kaggle 为对照 | 主口径 mean 28m / median 21m，达成 ≤50m |

报告"性能分析与局限性"应采用**双口径**叙述：in-distribution 体现能力上限，跨场景分组
体现泛化下限；跨场景波动源于 TelecomTS 仅 33 个场景、故障类型与场景族强相关的数据限制。
