# 文档索引（docs/）

> 本目录是源码工程的技术文档。下表按用途分类，并区分**权威参考**（反映当前实现）
> 与**阶段历史记录**（开发过程留档，可能与最新实现有差异，以权威文档为准）。
> 课程设计管理、报告正文与交付材料属项目级，见仓库根 `../../AGENTS.md` 与 `报告/`。

## 权威参考（反映当前系统）

| 文档 | 内容 | 报告对应章节 |
| --- | --- | --- |
| [development_spec.md](./development_spec.md) | 源码级开发规范、目录结构、技术栈、评估口径约定 | 总体设计 |
| [system_architecture.md](./system_architecture.md) | 总体架构、五条数据链路、模块依赖、关键时序（含 Mermaid 图） | 总体/功能设计、流程图、时序图 |
| [model_layer_and_detection.md](./model_layer_and_detection.md) | 模型层结构、异常检测融合、故障分类+复核、定位、评估方法与当前指标 | 核心算法、测试与性能分析 |
| [diagnosis_subsystem.md](./diagnosis_subsystem.md) | 规则引擎 + LLM 增强诊断（契约、回退、复核） | 核心算法、创新点 |
| [database_schema.md](./database_schema.md) | 7 张 SQLite 表字段、主外键、索引、E-R 图 | 数据库设计 |
| [api_reference.md](./api_reference.md) | 18 个 API 接口、参数、统一响应结构 | 详细设计 |
| [frontend_pages.md](./frontend_pages.md) | 10 页面 × 路由 × 接口 × 组件对照 | 界面设计 |
| [testing.md](./testing.md) | 测试清单、覆盖矩阵、运行方式 | 测试结果 |

## 运行与数据

| 文档 | 内容 |
| --- | --- |
| [run_and_demo_guide.md](./run_and_demo_guide.md) | 启动、健康检查、空库演示、数据写入、LLM 配置 |
| [data_import_template.md](./data_import_template.md) | 外部 CSV 导入字段模板与规则 |

## 状态与计划

| 文档 | 内容 |
| --- | --- |
| [latest_development_status.md](./latest_development_status.md) | 最新开发状态、功能闭环、模型层升级（M1–M5）、待补项 |
| [project_plan.md](./project_plan.md) | 项目计划与里程碑 |
| [system_function_structure.md](./system_function_structure.md) | 功能模块结构与实现文件对应关系 |

## 阶段历史记录（开发过程留档）

| 文档 | 内容 | 备注 |
| --- | --- | --- |
| [phase1_data_system_design.md](./phase1_data_system_design.md) | 阶段一：数据源、标签映射、字段字典、数据库草案 | 数据库草案以 [database_schema.md](./database_schema.md) 为准 |
| [phase2_run_and_evaluation.md](./phase2_run_and_evaluation.md) | 阶段二：运行命令与评估 | 结果已同步重构后现状；模型层以 [model_layer_and_detection.md](./model_layer_and_detection.md) 为准 |
| [phase3_backend_acceptance.md](./phase3_backend_acceptance.md) | 阶段三：后端验收记录 | 历史 |
| [phase4_frontend_integration.md](./phase4_frontend_integration.md) | 阶段四：前端联调记录 | 前端以 [frontend_pages.md](./frontend_pages.md) 为准 |

## 快速开始

```powershell
cd D:\CODE\lesson_design_02\main\lecture_design_02
python -m backend.src.models.train     # 训练 + 评估
pytest backend\tests                   # 测试（76 passed）
# 启动后端/前端见 run_and_demo_guide.md
```
