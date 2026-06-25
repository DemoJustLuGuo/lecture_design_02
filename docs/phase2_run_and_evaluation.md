# 阶段二运行说明与模型评估结果

> 说明：本文记录阶段二的运行命令与产物。模型层与故障检测在 M1–M5 已重构升级，
> **最新且权威的模型层/检测/评估口径见 [`model_layer_and_detection.md`](./model_layer_and_detection.md)**。
> 下文 §5–§8 已同步为重构后的现状。

## 1. 阶段二范围

阶段二完成公网数据正式接入、统一中间表生成、特征工程、异常检测模型训练、故障分类模型训练和定位误差统计。

当前阶段不包含前端页面开发，也不包含 FastAPI 页面联调。SQLite 和 FastAPI 从阶段三开始推进。

## 2. 运行命令

在源码工程目录执行：

```powershell
cd D:\CODE\lesson_design_02\main\lecture_design_02
```

生成正式中间表：

```powershell
python -m backend.src.data_ingestion.build_phase2_dataset
```

训练模型并生成评估结果：

```powershell
python -m backend.src.models.train
```

运行后端测试：

```powershell
pytest backend\tests
```

## 3. 阶段二正式产物

正式中间表位于：

```text
backend/data/processed/
```

包含：

| 文件 | 说明 |
| --- | --- |
| `network_metrics.csv` | 统一运行指标表 |
| `fault_samples.csv` | 统一故障样本表 |
| `diagnosis_knowledge.csv` | 诊断知识与排障建议表 |
| `base_stations.csv` | Kaggle 基站/小区工参表 |
| `location_samples.csv` | Kaggle 路测定位样本表 |
| `root_cause_samples.csv` | Kaggle C1-C8 根因样本表 |
| `dataset_manifest.json` | 数据源、行数和生成信息记录 |

模型文件位于：

```text
backend/saved_models/
```

包含：

| 文件 | 说明 |
| --- | --- |
| `feature_pipeline.joblib` | 分类特征管线（缺失值处理、标准化、类别编码） |
| `fault_classifier.joblib` | RandomForest 故障分类模型 |
| `anomaly_feature_pipeline.joblib` | 异常检测特征管线（数值 KPI + 派生，无高基数类别） |
| `anomaly_supervised.joblib` | 监督异常检测主通道（RandomForest） |
| `anomaly_detector.joblib` | IsolationForest 辅助通道 |
| `anomaly_fusion.joblib` | 融合权重、阈值与 IF 归一参数 |
| `anomaly_threshold.joblib` | 融合决策阈值（向后兼容） |

评估结果位于：

```text
backend/reports/
```

包含：

| 文件 | 说明 |
| --- | --- |
| `model_evaluation.json` | 模型评估指标 |
| `figures/confusion_matrix.png` | 故障分类混淆矩阵 |
| `figures/localization_error_distribution.png` | 定位误差分布图 |

## 4. 数据规模

正式中间表统计结果：

| 表 | 行数 |
| --- | ---: |
| `network_metrics.csv` | 263,994 |
| `fault_samples.csv` | 4,592 |
| `diagnosis_knowledge.csv` | 19 |
| `base_stations.csv` | 188 |
| `location_samples.csv` | 24,000 |
| `root_cause_samples.csv` | 2,400 |

`network_metrics.csv` 覆盖 5 类中文故障：

1. 信号中断/覆盖退化
2. 误码过高
3. 带宽不足
4. 基站故障
5. 信道干扰

## 5. 模型训练口径

第一版遵循阶段一约定：

1. TelecomTS 用于异常检测和主故障分类。
2. Kaggle 5G Root Cause 用于定位、地图和根因解释补充。
3. Kaggle C1-C8 不混入主故障分类训练，避免标签体系混杂。
4. `信号中断/覆盖退化` 主要由 Kaggle C1/C2/C7 支撑，因此不出现在 TelecomTS 主分类模型标签中。

异常检测模型（三通道融合）：

```text
监督 RandomForest 主通道 + 规则 KPI 通道 + IsolationForest 辅助
（分数归一加权融合，权重/阈值在验证集搜索）
```

故障分类模型：

```text
RandomForestClassifier（输出置信度，低置信度标记人工复核）
```

定位（两套口径）：

```text
synthetic_algorithm（主）：合成密集城区已知真值 + 加权最小二乘三边定位
public_proxy（对照）：Kaggle 路测点与工参位置的简化代理误差
```

## 6. 真实评估结果

固定 `random_seed = 42`，按 `scenario_id` 分组切分（`StratifiedGroupKFold`）：

| 项目 | 数值 |
| --- | ---: |
| 使用样本数 | 80,000 |
| 训练/验证/测试 | 49,998 / 16,658 / 13,344 |
| 训练耗时 `training_time_ms` | 12,548 ms |
| 单批检测耗时（13,344 样本） | 169 ms（0.0127 ms/样本） |

异常检测（双口径）：

| 口径 | accuracy | precision | recall | F1 |
| --- | ---: | ---: | ---: | ---: |
| in-distribution（能力上限） | 0.986 | 0.986 | 0.986 | — |
| 跨场景分组（诚实下限） | 0.745 | 0.661 | 1.000 | 0.796 |

故障分类（双口径）：

| 口径 | accuracy | f1_macro |
| --- | ---: | ---: |
| in-distribution（随机切分，泄漏） | 0.992 | 0.988 |
| 跨场景分组 holdout | 0.749 | 0.416 |
| 跨场景分组 3 折 CV | 0.509 ± 0.212 | 0.287 ± 0.084 |

故障分类标签：

```text
信道干扰、基站故障、带宽不足、正常、误码过高
```

定位误差：

| 口径 | mean | median | P90 |
| --- | ---: | ---: | ---: |
| synthetic_algorithm（主） | 28.0 m | 20.9 m | 56.7 m |
| public_proxy（Kaggle 对照） | 96.3 m | 87.4 m | 163.6 m |

## 7. 指标说明

故障分类在 in-distribution 口径达 99.2%，但按 `scenario_id` 分组后降到约 50–75% 且
折间方差极大，说明随机切分存在**同场景泄漏**，原高分偏乐观。报告应双口径并列说明，
根因是 TelecomTS 仅 33 个场景、故障类型与场景族强相关（数据结构限制，非模型缺陷）。

异常检测经"监督主通道 + 规则 + IF 融合"改造，能力上限从旧 IsolationForest 的 84.75%
提升至 **98.6%**，达成 ≥95% 目标；跨场景阈值迁移受限导致召回偏高、精确率下降。

定位以合成密集城区（已知真值）为主口径，加权最小二乘三边定位 mean 28m / median 21m，
达成 ≤50m 目标；Kaggle 96.25m 仅作代理对照。

> 以上方法与口径的完整说明见 [`model_layer_and_detection.md`](./model_layer_and_detection.md)。

## 8. 测试结果

当前后端测试：

```text
pytest backend\tests
```

结果：

```text
76 passed
```

测试覆盖：

1. 阶段二中间表存在性、数据量与故障类型覆盖。
2. Kaggle 定位样本与根因样本可用性、诊断知识与标签映射完整性。
3. 模型文件、评估 JSON 与图表产物存在性。
4. 统一路径配置、特征管线维度稳定性。
5. 定位几何与加权三边定位、合成定位基准（达标 + 确定性）。
6. 异常检测规则分/融合/运行时、故障分类低置信度复核。

