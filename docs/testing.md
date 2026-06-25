# 测试说明与覆盖矩阵

> 后端使用 Pytest，前端以 `tsc -b && vite build` 与 `npm run validate:demo` 保证构建。
> 本文档列出测试清单、覆盖点与运行方式，供课程报告"测试结果"章节引用。

## 1. 运行方式

```powershell
cd D:\CODE\lesson_design_02\main\lecture_design_02

# 后端全部测试
pytest backend\tests            # 当前 76 passed

# 单文件 / 关键字
pytest backend\tests\test_anomaly_detection.py
pytest backend\tests -k locator

# 前端构建与演示资产校验
cd frontend
npm run validate:demo
npm run build
```

后端测试用例 `conftest.py` 将工程根加入 `sys.path`；涉及数据库的用例使用
`tmp_path` 临时库，不依赖运行态 `app.db`（演示库保持空白）。

## 2. 覆盖矩阵（共 76 用例）

| 测试文件 | 用例 | 覆盖点 |
| --- | ---: | --- |
| `test_phase2_ingestion.py` | 5 | 中间表生成、字段完整性、故障类型覆盖、标签映射 |
| `test_phase2_training.py` | 4 | 模型工件与图表存在、评估 JSON 必备指标、主分类标签集 |
| `test_config_paths.py` | 5 | `utils.config` 路径正确性（BACKEND_ROOT/数据/模型/报告/schema/工作区/数据集） |
| `test_feature_pipeline.py` | 2 | 特征管线维度稳定、未知类别不改变维度 |
| `test_locator.py` | 8 | 距离、最近锚点、加权质心、(加权)最小二乘三边定位、误差、退化回退、权重 |
| `test_localization_benchmark.py` | 2 | 合成密集城区定位达标(中位<50m)、固定种子确定性 |
| `test_visualization.py` | 4 | 混淆矩阵图、定位误差分布图、故障地图（含空帧）产出非空 |
| `test_anomaly_detection.py` | 4 | 规则分高低、融合加权、IF 归一裁剪、运行时融合 smoke（劣化分更高） |
| `test_fault_review.py` | 2 | 低置信度阈值逻辑、分类输出携带 `review_required`/`review_reason` |
| `test_database_repository.py` | 4 | 仓储层读写、查询、聚合 |
| `test_inference_persistence.py` | 10 | 推理结果落库：故障+诊断快照、幂等、状态保留、检测/分类互更、跳过正常样本、筛选、趋势、基站详情、中文规则诊断 |
| `test_demo_loader.py` | 1 | 演示库刷新流程 |
| `test_simulation_generation_import.py` | 7 | 合成生成、预览写入、外部 CSV 导入与错误记录 |
| `test_llm_diagnosis.py` | 6 | LLM 增强合并、未配置/失败回退规则、结构化契约 |
| `test_api_core.py` | 12 | 核心 API 返回结构、筛选、检测/分类路由、模拟数据管理（含 monkeypatch） |

## 3. 与验收目标的对应

| 验收点 | 支撑测试 |
| --- | --- |
| 数据模拟字段完整、标签分布合理 | `test_phase2_ingestion` |
| 特征工程维度稳定 | `test_feature_pipeline` |
| 模型固定随机种子可复现、指标产出 | `test_phase2_training`、`test_localization_benchmark` |
| 异常检测融合 / 分类复核机制 | `test_anomaly_detection`、`test_fault_review` |
| 定位算法正确性 | `test_locator`、`test_localization_benchmark` |
| API 返回统一结构 | `test_api_core` |
| SQLite 读写与持久化 | `test_database_repository`、`test_inference_persistence` |
| 诊断规则兜底 + LLM 回退 | `test_llm_diagnosis` |
| 前端构建通过 | `npm run build`、`npm run validate:demo` |

## 4. 模型指标的"测试"与"评估"区分

- **测试**（本文）验证功能正确性与产物存在性，使用小样本/临时库，快速确定性。
- **评估指标**（准确率/混淆矩阵/定位误差等）由 `python -m backend.src.models.train`
  在完整数据上产出到 `reports/model_evaluation.json`，采用分组切分 + 双口径，详见
  [`model_layer_and_detection.md`](./model_layer_and_detection.md)。两者不可混淆：测试
  绿不等于指标达标，指标需看评估报告。
