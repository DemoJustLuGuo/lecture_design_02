# 阶段二运行说明与模型评估结果

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
| `feature_pipeline.joblib` | 缺失值处理、标准化、类别编码管道 |
| `anomaly_detector.joblib` | IsolationForest 异常检测模型 |
| `anomaly_threshold.joblib` | 验证集校准得到的异常分数阈值 |
| `fault_classifier.joblib` | RandomForest 故障分类模型 |

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

异常检测模型：

```text
IsolationForest
```

故障分类模型：

```text
RandomForestClassifier
```

定位误差：

```text
Kaggle 路测位置 + 工参位置的简化定位误差统计
```

## 6. 真实评估结果

本次训练使用固定随机种子：

```text
random_seed = 42
```

训练数据规模：

| 项目 | 数值 |
| --- | ---: |
| 使用样本数 | 80,000 |
| 训练集 | 56,000 |
| 验证集 | 12,000 |
| 测试集 | 12,000 |
| 检测耗时 | 5,267.54 ms |

异常检测指标：

| 指标 | 数值 |
| --- | ---: |
| accuracy | 0.8475 |
| precision | 0.8078 |
| recall | 0.9103 |
| F1 | 0.8560 |

故障分类指标：

| 指标 | 数值 |
| --- | ---: |
| accuracy | 0.9930 |
| precision_macro | 0.9864 |
| recall_macro | 0.9936 |
| F1_macro | 0.9899 |

故障分类标签：

```text
信道干扰、基站故障、带宽不足、正常、误码过高
```

平均定位误差：

```text
96.25 m
```

## 7. 指标说明

故障分类准确率达到课程建议目标，能够支撑报告中的故障识别效果分析。

异常检测准确率当前为 84.75%，未达到指导书建议的 95%。报告中应如实说明原因：

1. 当前异常检测仅采用 IsolationForest。
2. TelecomTS 正常与异常样本在部分 KPI 上存在重叠。
3. 阈值通过验证集校准，优先提高召回率，减少漏检。

后续优化方向：

1. 引入规则阈值 + AI 模型双通道异常检测。
2. 针对不同故障类型分别训练异常检测器。
3. 增加特征窗口统计、趋势特征和受影响 KPI 特征。
4. 使用 XGBoost 或监督二分类模型作为对比。

定位误差当前为 96.25 m，未达到 50 m 目标。报告中应如实说明：

1. 当前定位依据 Kaggle 路测点和工参位置做简化统计。
2. 数据集中未提供严格意义上的真实故障点坐标。
3. 后续可采用加权质心、邻区 RSRP 加权或路径损耗模型优化。

## 8. 测试结果

当前后端测试：

```text
pytest backend\tests
```

结果：

```text
9 passed
```

测试覆盖：

1. 阶段二中间表存在性。
2. 运行指标数据量和故障类型覆盖。
3. Kaggle 定位样本和根因样本可用性。
4. 诊断知识和标签映射完整性。
5. 模型文件、评估 JSON 和图表产物存在性。
6. 主分类模型未混入 Kaggle 的 `信号中断/覆盖退化` 标签。

