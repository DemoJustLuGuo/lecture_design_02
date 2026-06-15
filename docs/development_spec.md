# 题目5工程开发规范

## 1. 项目定位

本工程选择课程设计题目5：基于AI的智能通信故障检测与诊断系统。

系统目标是构建一个可演示、可测试、可写入课程设计报告的软件系统，完成以下主流程：

```text
通信网络数据模拟 -> 异常检测 -> 故障分类 -> 故障定位 -> 诊断建议 -> 日志统计与可视化
```

开发时优先保证主流程闭环完整，再扩展模型复杂度和界面细节。不要为了追求复杂算法而牺牲可运行性、可复现性和答辩展示效果。

## 2. 技术栈

### 2.1 前端

前端采用 React + Vite + Tailwind CSS，按前后端分离方式开发。

| 技术 | 用途 |
| --- | --- |
| React | 构建监控管理系统和移动端预警页面 |
| Vite | 前端开发服务器、构建和打包 |
| Tailwind CSS | 页面布局、响应式样式和组件样式 |
| 轻量级前端路由 | 页面路由管理 |
| React state/hooks | 告警、基站、模型指标等状态管理 |
| Axios | 调用 FastAPI 后端接口 |
| ECharts | 趋势图、统计图、混淆矩阵等图表 |
| Leaflet | 基站位置、故障位置和定位误差范围展示 |

前端界面应采用管理系统风格，强调信息密度、可读性和操作效率，不做营销式首页。

### 2.2 后端

后端采用 Python + FastAPI，负责接口、数据模拟、模型训练、模型推理和数据库读写。

| 技术 | 用途 |
| --- | --- |
| FastAPI | REST API 服务 |
| Uvicorn | 本地开发和演示运行 |
| NumPy | 指标模拟和数值计算 |
| Pandas | 数据集构造、清洗和统计 |
| Scikit-learn | 异常检测、故障分类、模型评估 |
| XGBoost | 可选的故障分类增强模型 |
| SQLite | 基站数据、运行指标、故障日志存储 |
| Joblib | 模型保存和加载 |
| Matplotlib | 生成报告图表 |
| Pytest | 核心模块和接口测试 |

### 2.3 推荐模型

| 任务 | 首选方案 | 备选方案 |
| --- | --- | --- |
| 异常检测 | IsolationForest | OneClassSVM、规则阈值 |
| 故障分类 | RandomForestClassifier | XGBoost、MLP |
| 故障定位 | 加权质心定位 | 最近基站、三角定位 |
| 诊断建议 | 规则引擎 | 规则引擎 + 置信度说明 |

课程设计阶段不优先实现复杂的 CNN+Transformer 或真实移动 App。若后续时间充足，可作为增强项加入。

## 3. 目标工程目录

后续开发按以下目录组织。当前已有的 `src/` 空模块可在正式开发时迁移到 `backend/src/`。

```text
lecture_design_02/
  backend/
    src/
      api/
        app.py
        routes/
          dashboard.py
          stations.py
          faults.py
          diagnosis.py
          simulation.py
          model.py
      data_sim/
        network_generator.py
        fault_injector.py
      feature_engine/
        features.py
        preprocessing.py
      models/
        anomaly_detector.py
        fault_classifier.py
        locator.py
        train.py
        evaluate.py
      diagnosis/
        rules.py
        suggestions.py
      database/
        schema.sql
        db.py
        repository.py
      visualization/
        charts.py
        fault_map.py
      utils/
        config.py
        metrics.py
    data/
      raw/
      processed/
    saved_models/
    reports/
      figures/
    tests/

  frontend/
    package.json
    vite.config.ts
    src/
      react/
        api.ts
        Dashboard.tsx
        charts.tsx
        types.ts
      App.tsx
      main.tsx

  docs/
    development_spec.md
```

## 4. 后端模块规范

### 4.1 数据模拟模块

位置：`backend/src/data_sim/`

必须模拟以下实体和指标：

| 类型 | 字段示例 |
| --- | --- |
| 基站 | station_id、x、y、height、tx_power、status |
| 终端或采样点 | user_id、x、y、serving_station_id |
| 链路指标 | signal_strength、sinr、ber、bandwidth_usage、latency、packet_loss、throughput |
| 设备指标 | cpu_load、temperature、power_status |
| 故障标签 | fault_type、fault_level、fault_x、fault_y |

故障注入至少覆盖 4 类：

1. 信号中断：信号强度突降、吞吐量接近 0。
2. 误码过高：BER 升高、SINR 降低。
3. 带宽不足：带宽占用率过高、时延升高、吞吐下降。
4. 基站故障：设备温度或 CPU 异常、覆盖区域整体指标恶化。

### 4.2 特征工程模块

位置：`backend/src/feature_engine/`

特征处理至少包括：

1. 缺失值处理。
2. 异常值裁剪或标记。
3. 数值特征标准化。
4. 类别特征编码。
5. 训练集、验证集、测试集划分。

模型训练不能直接读取前端输入，应统一通过特征工程模块生成标准特征矩阵。

### 4.3 AI模型模块

位置：`backend/src/models/`

模型模块分为三类：

| 文件 | 职责 |
| --- | --- |
| `anomaly_detector.py` | 训练和调用异常检测模型 |
| `fault_classifier.py` | 训练和调用故障分类模型 |
| `locator.py` | 估算故障坐标并计算定位误差 |
| `train.py` | 一键训练并保存模型 |
| `evaluate.py` | 输出准确率、召回率、F1、混淆矩阵、定位误差 |

模型文件统一保存到 `backend/saved_models/`，命名格式：

```text
anomaly_detector.joblib
fault_classifier.joblib
feature_pipeline.joblib
```

### 4.4 诊断建议模块

位置：`backend/src/diagnosis/`

诊断建议采用规则引擎实现。输入故障类型、置信度、关键指标和定位信息，输出：

1. 故障原因分析。
2. 推荐处理动作。
3. 影响范围说明。
4. 是否需要人工复核。

示例规则：

| 故障类型 | 诊断建议 |
| --- | --- |
| 信号中断 | 检查基站供电、射频模块和链路连接 |
| 误码过高 | 排查同频干扰，调整频点或发射功率 |
| 带宽不足 | 分析高峰时段流量，考虑扩容或限流 |
| 基站故障 | 检查设备温度、CPU负载和告警状态 |

### 4.5 数据库模块

位置：`backend/src/database/`

建议使用 SQLite。至少包含以下表：

| 表名 | 用途 |
| --- | --- |
| `base_stations` | 基站基础信息 |
| `network_metrics` | 运行指标采样记录 |
| `fault_logs` | 故障检测、分类和定位结果 |
| `diagnosis_records` | 诊断建议和处理状态 |
| `model_evaluations` | 模型评估指标 |

数据库访问统一封装在 repository 层，API 路由不得直接拼接 SQL。

## 5. 后端接口规范

所有业务接口以 `/api` 为前缀，返回 JSON。

| 接口 | 方法 | 用途 |
| --- | --- | --- |
| `/api/dashboard/summary` | GET | 获取监控总览指标 |
| `/api/stations` | GET | 获取基站列表 |
| `/api/stations/{station_id}` | GET | 获取单个基站详情 |
| `/api/metrics/realtime` | GET | 获取实时运行指标 |
| `/api/faults` | GET | 查询故障日志 |
| `/api/faults/{fault_id}` | GET | 查看故障详情 |
| `/api/faults/detect` | POST | 执行异常检测 |
| `/api/faults/classify` | POST | 执行故障分类 |
| `/api/diagnosis/{fault_id}` | GET | 获取诊断建议 |
| `/api/model/evaluation` | GET | 获取模型评估结果 |
| `/api/simulation/run` | POST | 触发模拟数据生成 |

统一响应结构：

```json
{
  "success": true,
  "data": {},
  "message": ""
}
```

错误响应应包含明确原因：

```json
{
  "success": false,
  "data": null,
  "message": "model file not found"
}
```

## 6. 前端页面规范

前端页面以管理系统为主，不设置营销式落地页。首屏进入监控总览。

### 6.1 页面清单

| 页面 | 路由 | 核心内容 |
| --- | --- | --- |
| 监控总览 | `/` | 在线基站数、当前告警数、严重故障数、检测准确率、近期趋势 |
| 基站管理 | `/stations` | 基站列表、状态、关键指标 |
| 基站详情 | `/stations/:id` | 单站指标趋势、近期故障 |
| 故障日志 | `/faults` | 故障查询、筛选、处理状态 |
| 故障地图 | `/map` | 基站位置、故障位置、定位误差范围 |
| 诊断建议 | `/diagnosis/:id` | 原因分析、处理建议、影响范围 |
| 模型评估 | `/metrics` | 准确率、混淆矩阵、定位误差、检测耗时 |
| 移动预警 | `/mobile-alert` | 窄屏告警列表和故障详情 |

### 6.2 组件规范

通用组件放在 `frontend/src/components/`。

| 组件 | 职责 |
| --- | --- |
| `MetricCard.tsx` | 展示单个关键指标 |
| `StatusBadge.tsx` | 展示正常、预警、严重等状态 |
| `FaultTable.tsx` | 故障日志表格 |
| `TrendChart.tsx` | 指标趋势图 |
| `FaultTypeChart.tsx` | 故障类型统计图 |
| `BaseStationMap.tsx` | 基站和故障地图 |
| `AlertPanel.tsx` | 实时告警列表 |

页面组件只负责编排，不直接写复杂业务判断。复杂数据处理放到 API 层、store 层或后端完成。

### 6.3 视觉和交互规范

1. 使用清晰的侧边导航和顶部状态栏。
2. 页面布局保持信息密度，避免大面积装饰元素。
3. 状态颜色应稳定：正常为绿色，预警为黄色，严重为红色，离线为灰色。
4. 表格必须支持按故障类型、严重程度、时间筛选。
5. 图表必须有标题、坐标含义和单位。
6. 移动预警页优先展示严重故障和处理建议。

## 7. 最小可交付版本

第一阶段必须完成以下能力：

1. 生成不少于 3000 条通信网络运行数据。
2. 注入至少 4 类故障，并保留标签。
3. 训练异常检测模型和故障分类模型。
4. 输出检测准确率、分类准确率、召回率、F1 和混淆矩阵。
5. 实现简化故障定位并输出平均定位误差。
6. 使用 SQLite 保存基站、指标、故障日志和诊断记录。
7. FastAPI 提供核心业务接口。
8. React 页面展示总览、基站、故障日志、故障地图、诊断建议和模型评估。
9. 生成可用于报告的截图和图表。

## 8. 指标和验收标准

课程设计验收时重点关注可运行程序、测试验证和报告支撑。建议使用以下指标：

| 类型 | 指标 | 目标 |
| --- | --- | --- |
| 异常检测 | accuracy、precision、recall、F1 | 检测准确率尽量达到 95% |
| 故障分类 | accuracy、confusion matrix | 分类准确率尽量达到 90% |
| 故障定位 | average localization error | 模拟无线场景中尽量控制在 50 米以内 |
| 性能 | detection latency | 单批检测耗时可展示 |
| 工程 | API 可用性 | 核心接口可通过测试或页面调用 |
| 展示 | 页面完整性 | 至少 6 个核心页面可演示 |

如果真实指标未达到目标，报告中必须解释原因，并给出优化方向。不要伪造测试结果。

## 9. 开发约定

### 9.1 Python

1. 业务逻辑按模块拆分，避免把训练、接口和数据库操作写在同一个文件中。
2. 函数命名使用 snake_case。
3. 模型训练脚本必须支持固定随机种子，保证结果可复现。
4. 文件路径通过配置模块统一管理，不在业务代码中散落硬编码路径。
5. 数据生成、模型训练、模型评估应能独立运行。

### 9.2 React

1. 组件命名使用 PascalCase。
2. API 请求统一放在 `frontend/src/api/`。
3. 页面状态优先使用 React state/hooks 管理。
4. Tailwind class 可以直接写在模板中，但重复布局应封装为组件。
5. 图表组件应接收数据作为 props，不在组件内部直接请求接口。

### 9.3 数据和模型

1. 原始模拟数据保存到 `backend/data/raw/`。
2. 清洗后的训练数据保存到 `backend/data/processed/`。
3. 训练好的模型保存到 `backend/saved_models/`。
4. 报告图表保存到 `backend/reports/figures/`。
5. 大文件、临时文件和缓存文件不应提交到版本库。

## 10. 推荐开发顺序

1. 搭建后端目录和基础配置。
2. 实现数据模拟和故障注入。
3. 实现特征工程和模型训练。
4. 实现模型评估和报告图表生成。
5. 建立 SQLite 表结构和数据写入流程。
6. 开发 FastAPI 核心接口。
7. 搭建 React + Vite + Tailwind 前端工程。
8. 实现监控总览、故障日志和模型评估页面。
9. 实现故障地图和诊断建议页面。
10. 补充测试、截图、报告素材和演示视频材料。

## 11. 报告支撑材料

开发过程中需要保留以下材料，便于写课程设计报告：

1. 系统总体架构图。
2. 功能模块图。
3. 关键业务流程图。
4. 数据库 E-R 图和数据表结构。
5. 异常检测和故障分类算法说明。
6. 混淆矩阵、准确率、召回率、F1 等模型指标。
7. 故障定位误差统计。
8. Web 页面运行截图。
9. 关键代码截图。
10. 使用大模型辅助设计的提示词记录。

## 12. 创新点建议

至少选择 2 到 3 个创新点写入报告和答辩材料：

1. 规则阈值 + AI 模型的双通道异常检测。
2. 故障分类结果输出置信度，低置信度故障标记为人工复核。
3. 故障地图展示定位误差范围。
4. 基于历史日志统计高发基站、高发时段和高发故障类型。
5. 移动端预警页面支持快速查看严重故障和处理建议。

