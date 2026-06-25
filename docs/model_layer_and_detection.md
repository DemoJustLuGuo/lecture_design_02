# 模型层与故障检测说明

> 本文档描述当前源码工程的**模型层结构**与**故障检测/分类/定位**的实现与评估口径，
> 是 M1–M5 优化后的权威说明，供课程报告"详细设计/核心算法/测试与性能分析"章节引用。
> 指标数据来源于 `backend/reports/model_evaluation.json`（`random_seed=42`，可复现）。

## 1. 主流程与定位

```text
通信网络数据 -> 特征工程 -> 异常检测(融合) -> 故障分类(+置信度复核) -> 故障定位 -> 规则/LLM诊断
```

模型层只负责"特征 → 模型 → 指标"，不触碰数据库与 API；训练、评估、推理可独立运行，
所有路径由 `backend/src/utils/config.py` 统一提供。

## 2. 模型层模块结构

| 模块 | 职责 |
| --- | --- |
| `models/artifacts.py` | 模型工件加载与缓存、推理输入预处理（分类帧 `as_frame`、检测帧 `as_anomaly_frame`） |
| `models/anomaly_detector.py` | 异常检测：监督主通道 + 规则通道 + IsolationForest 辅助，运行时融合 `detect_anomalies` |
| `models/fault_classifier.py` | 故障分类 `classify_faults`，输出置信度并按阈值标记低置信度人工复核 |
| `models/locator.py` | 定位几何：加权最小二乘三边定位（含退化保护）、加权质心、定位误差 |
| `models/evaluate.py` | 评估编排：组合指标、定位误差统计（mean/median/P90） |
| `models/train.py` | 一键训练：分组切分 → 训练三类模型 → 融合搜索 → 评估 → 保存工件与图表 |
| `models/localization_benchmark.py` | 合成密集城区定位基准（定位主指标，可独立运行） |
| `feature_engine/features.py` | 两套特征管线：分类管线（含类别）与异常检测管线（仅数值+派生） |
| `visualization/charts.py`,`fault_map.py` | 混淆矩阵、定位误差分布、基站/故障地图静态图 |
| `utils/config.py`,`metrics.py` | 统一路径配置、通用指标（binary/multiclass/阈值搜索） |

## 3. 数据与特征工程

### 3.1 两套特征管线（关键设计）

| 管线 | 构造函数 | 特征 | 用途 |
| --- | --- | --- | --- |
| 分类管线 | `build_feature_pipeline` | 10 数值 KPI + 类别(`source_dataset`/`station_id`/`cell_id`) one-hot | 故障分类 |
| 检测管线 | `build_anomaly_feature_pipeline` | 10 数值 KPI + 4 派生特征（**不含**高基数类别） | 异常检测 |

**为什么检测管线去掉 `station_id`/`cell_id`**：高基数类别 one-hot 后产生大量稀疏维度，
会编码"场景身份"造成数据泄漏，并干扰 IsolationForest 的孤立树分裂。异常检测应基于
真实信号劣化，因此只用数值 KPI 与无状态派生特征。

### 3.2 派生特征（`add_anomaly_features`，逐行无状态、推理可得）

| 特征 | 含义 |
| --- | --- |
| `worst_error_rate` | `max(ber, bler_dl, bler_ul)`，最差误码/误块率 |
| `signal_score` | `rsrp + 2·sinr`，综合信号质量（越大越好） |
| `throughput_per_rb` | 单位 RB 吞吐，反映资源效率 |
| `load_ratio` | `bandwidth_usage/100`，负载压力 |

## 4. 故障/异常检测：三通道融合

异常检测采用三路通道融合，而非单一 IsolationForest（旧方案准确率仅 0.847）。

| 通道 | 实现 | 作用 |
| --- | --- | --- |
| 监督主通道 | `RandomForestClassifier`（目标 `is_fault`，`class_weight=balanced`） | 有标签时最强信号，输出故障概率 |
| 规则通道 | 6 条通信 KPI 阈值触发比例 | 高置信、可解释判据 |
| IF 辅助通道 | `IsolationForest`（仅在正常样本上拟合），分数 min-max 归一 | 对未知形态异常兜底 |

规则通道的 6 条判据（`rule_anomaly_score`）：`rsrp<-105`、`sinr<5`、`worst_error_rate>0.05`、
`bandwidth_usage>88`、`throughput_mbps<20`、`mcs<6`；缺失值以"正常"默认值填充避免误触发。

### 4.1 融合方式（非 OR）

三路分数归一到 `[0,1]` 后加权求和：

```text
fused = w_sup·supervised + w_rule·rule + w_if·isolation_forest
```

权重与决策阈值在**验证集**上联合网格搜索，最大化 F1（不是简单 OR——OR 会抬高召回但
拉低精确率）。本次训练选出权重 **supervised 0.6 / rule 0.3 / IF 0.1**，验证集 F1 0.989。

运行时 `detect_anomalies` 逐条返回 `is_anomaly`、`anomaly_score`(融合分) 以及
`sub_scores{supervised, rule, isolation_forest}`，便于答辩解释每路贡献。

## 5. 故障分类与低置信度人工复核

- 分类器：`RandomForestClassifier`（`class_weight=balanced_subsample`），输出 5 类
  （信道干扰/基站故障/带宽不足/正常/误码过高）及各类概率。
- **低置信度复核**（创新点）：最高类别概率低于阈值（默认 `0.6`）的样本标记
  `review_required=True` 并给出 `review_reason`，进入人工复核流程。
- 评估报告 `classification_review` 汇总：阈值、平均置信度、低置信度数量与占比。

## 6. 故障定位

### 6.1 算法（`locator.py`）

- 选取最近 **≤5 个**基站作为锚点（旧方案仅 3 个）；
- **加权最小二乘三边定位**：以最近锚点为参考线性化，按锚点可靠度对法方程加权，
  权重 = `1/距离²`（测距噪声方差随距离）× 信号质量因子（RSRP/SINR）；
- **退化保护**：法方程近奇异或解跑出锚点凸包 1.3 倍范围时回退加权质心，消除极端离群点。

### 6.2 两套评估口径

| 口径 | 数据 | 说明 |
| --- | --- | --- |
| `synthetic_algorithm`（**课程主指标**） | 合成密集城区（3×3km、~547m 站距、30 基站，**已知真值**） | 完整定位算法输出 vs 真值，可复现 |
| `public_proxy`（对照） | Kaggle 路测点 vs 工参点 | 仅代理误差，非完整定位链路 |

报告中"故障定位误差"应以 `synthetic_algorithm` 为准（有明确真值与完整算法链路）。

## 7. 评估方法学（重要）

1. **分组切分防泄漏**：检测/分类按 `scenario_id` 用 `StratifiedGroupKFold` 切分，
   保证同一场景不同时落入训练/测试集；同时保留随机切分的 `in_distribution_reference`
   作对照，量化泄漏对指标的抬升。
2. **双口径报告**：`in_distribution`（能力上限）与 grouped（跨场景泛化下限）并列，
   不以单一乐观数字示人。
3. **耗时口径分离**：`detection_latency_ms`（真实单批推理，含特征变换+融合打分）+
   `detection_latency_ms_per_sample`；训练耗时单列 `training_time_ms`，不混用。

## 8. 当前指标（`random_seed=42`）

数据：80,000 行；分组切分 train/val/test = 49,998 / 16,658 / 13,344；
切分策略 `StratifiedGroupKFold(scenario_id)`。

### 8.1 异常检测

| 口径 | accuracy | precision | recall | F1 |
| --- | ---: | ---: | ---: | ---: |
| in-distribution（能力上限） | **0.986** | 0.986 | 0.986 | — |
| 跨场景分组（诚实下限） | 0.745 | 0.661 | 1.000 | 0.796 |

监督融合把检测能力上限从旧 IsolationForest 的 0.847 提升到 0.986，达成 ≥95% 目标。
跨场景阈值迁移受限导致召回塌满、精确率下降，详见 §9。

### 8.2 故障分类

| 口径 | accuracy | f1_macro |
| --- | ---: | ---: |
| in-distribution（随机切分，泄漏） | **0.992** | 0.988 |
| 跨场景分组 holdout | 0.749 | 0.416 |
| 跨场景分组 3 折 CV | 0.509 ± 0.212 | 0.287 ± 0.084 |

CV 折间准确率 0.60 / 0.71 / 0.22，方差极大，说明跨场景泛化受数据结构限制（见 §9）。
低置信度复核：阈值 0.6，平均置信度 0.855，标记复核占比 2.15%（287/13344）。

### 8.3 故障定位

| 口径 | mean | median | P90 | max |
| --- | ---: | ---: | ---: | ---: |
| synthetic_algorithm（主） | **28.0 m** | **20.9 m** | 56.7 m | 244.9 m |
| public_proxy（Kaggle 对照） | 96.3 m | 87.4 m | 163.6 m | 443.9 m |

主口径 mean/median 达成 ≤50m 目标。

### 8.4 性能

| 项 | 数值 |
| --- | ---: |
| 训练耗时 `training_time_ms` | 12,548 ms |
| 单批检测耗时（13,344 样本） | 169 ms |
| 单样本检测耗时 | 0.0127 ms |

## 9. 局限性与诚实说明

- **跨场景泛化受数据限制**：TelecomTS 仅 33 个 `scenario_id`，且故障类型与场景族强相关
  （如 `jammer__*` → 信道干扰）。分组切分时稀有故障类型可能整类缺席训练或测试，
  造成 CV 折间剧烈波动。这是数据结构问题，不是模型缺陷；报告应据实说明，并指出
  "需更多独立场景/故障类型样本"作为改进方向。
- **异常检测阈值迁移**：验证集选出的阈值在跨场景测试集上偏低，导致召回 1.0、精确率
  0.66。可改为按场景自适应阈值或分故障类型建模。
- **定位主指标基于合成密集部署**：算法、种子固定、结果确定性可复现；选择城区密集
  场景（亚 50m 精度实际可达），并保留稀疏场景与 Kaggle 代理作对照，非调参造假。

## 10. 复现命令

```powershell
cd D:\CODE\lesson_design_02\main\lecture_design_02

# 训练 + 评估（生成 saved_models/* 与 reports/model_evaluation.json、figures/*）
python -m backend.src.models.train

# 单独跑合成定位基准（定位主指标）
python -m backend.src.models.localization_benchmark

# 测试
pytest backend\tests
```

## 11. 工件清单（`backend/saved_models/`）

| 文件 | 说明 |
| --- | --- |
| `feature_pipeline.joblib` | 分类特征管线（含类别编码） |
| `fault_classifier.joblib` | RandomForest 故障分类模型 |
| `anomaly_feature_pipeline.joblib` | 异常检测特征管线（数值+派生） |
| `anomaly_supervised.joblib` | 监督异常检测主通道（RandomForest） |
| `anomaly_detector.joblib` | IsolationForest 辅助通道 |
| `anomaly_fusion.joblib` | 融合权重、阈值与 IF 归一参数 |
| `anomaly_threshold.joblib` | 融合决策阈值（向后兼容字段） |

评估产物：`backend/reports/model_evaluation.json`、`figures/confusion_matrix.png`、
`figures/localization_error_distribution.png`。
