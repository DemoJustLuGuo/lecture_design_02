# CLAUDE.md - 源码级开发规范

## 作用域

本文件位于源码工程根目录，作用于：

```text
D:\CODE\lesson_design_02\main\lecture_design_02
```

本文件只关心代码实现，包括前端、后端、模型、数据库、测试、运行和构建。

课程设计管理、报告、答辩、参考文件和交付材料不在本文件职责范围内。相关事项回到项目级规范：

```text
D:\CODE\lesson_design_02\CLAUDE.md
```

详细工程开发规范见：

```text
D:\CODE\lesson_design_02\main\lecture_design_02\docs\development_spec.md
```

若需要了解项目当前工作进度、阶段性验收记录、系统结构说明、补充设计信息或后续 TODO，应优先读取源码工程内的 `docs/` 目录。该目录用于保存阶段文档、运行说明、系统功能结构和联调记录，是继续开发前判断项目状态的重要依据。

## 当前实现目标

实现题目5：基于AI的智能通信故障检测与诊断系统。

源码工程必须围绕以下闭环开发：

```text
通信网络数据模拟 -> 异常检测 -> 故障分类 -> 故障定位 -> 诊断建议 -> 日志统计与可视化
```

所有代码改动都应能服务于这个闭环，避免无关功能扩张。

## 技术栈

### 前端

```text
React + Vite + Tailwind CSS + Axios + ECharts + Leaflet
```

前端采用前后端分离模式，只调用后端 API，不直接访问数据库或模型文件。

### 后端

```text
Python + FastAPI + Uvicorn + NumPy + Pandas + Scikit-learn + XGBoost + SQLite + Joblib + Pytest
```

后端负责数据模拟、特征工程、模型训练、模型推理、数据库读写和 API 服务。

## 目标目录结构

后端代码组织为以下结构：

```text
lecture_design_02/
  backend/
    src/
      api/            # FastAPI 应用与路由
      data_sim/       # 合成数据生成
      data_ingestion/ # 原始数据集构建、演示库刷新、外部 CSV 导入
      feature_engine/ # 特征工程
      models/         # 工件加载、异常检测、故障分类、定位、评估、训练
      diagnosis/      # 规则诊断、诊断服务、LLM 增强适配
      database/       # schema、连接、初始化、仓储层
      utils/          # 统一路径配置与通用指标
      visualization/  # 报告图表与故障地图
    data/
      raw/
      processed/
      generated_preview/
    saved_models/
    reports/
      figures/
    tests/

  frontend/
    src/
      api/         # Axios 接口封装
      components/
      pages/       # 各路由页面
      hooks/
      router.tsx
      App.tsx
      main.tsx

  docs/
```

根级早期空 `src/` 骨架已删除，正式代码统一位于 `backend/` 和 `frontend/`。
后端所有文件路径统一由 `backend/src/utils/config.py` 提供，禁止散落硬编码。

## 后端开发规则

### 模块边界

| 模块              | 职责                                                      |
| ----------------- | --------------------------------------------------------- |
| `api/`            | FastAPI 应用入口和路由                                    |
| `data_sim/`       | 基站、终端、网络指标和故障数据模拟                        |
| `data_ingestion/` | 原始数据集构建、演示库刷新、外部 CSV 导入                 |
| `feature_engine/` | 特征构造、清洗、编码、标准化和数据集划分                  |
| `models/`         | 工件加载、异常检测、故障分类、定位、训练和评估            |
| `diagnosis/`      | 诊断规则、诊断服务和可选 LLM 增强                         |
| `database/`       | SQLite schema、连接、初始化和 repository                  |
| `visualization/`  | 报告图表和故障地图生成                                    |
| `utils/`          | 统一路径配置（`config.py`）和通用指标工具（`metrics.py`） |

### 代码约定

1. Python 函数和文件使用 snake_case。
2. 训练、评估、API、数据库访问不得混写在同一个文件中。
3. 所有随机过程必须支持固定 random seed。
4. 模型文件统一保存到 `backend/saved_models/`。
5. 原始模拟数据保存到 `backend/data/raw/`。
6. 处理后的数据保存到 `backend/data/processed/`。
7. 报告图表保存到 `backend/reports/figures/`。
8. API 路由不得直接拼接 SQL，应通过 repository 层访问数据库。
9. 业务接口统一返回 JSON。
10. 模型训练和评估应能独立运行，不依赖前端页面。

### 推荐模型

| 任务     | 首选实现                                           |
| -------- | -------------------------------------------------- |
| 异常检测 | 监督RF主通道 + 规则 + IsolationForest 辅助（融合） |
| 故障分类 | RandomForestClassifier                             |
| 增强分类 | XGBoost                                            |
| 故障定位 | 加权质心定位                                       |
| 诊断建议 | 规则引擎                                           |

不要优先实现复杂深度学习模型，除非主流程已经稳定可运行。

## 前端开发规则

### 页面范围

前端首屏进入监控总览，不做营销式首页。

至少实现以下页面：

| 页面     | 路由             |
| -------- | ---------------- |
| 监控总览 | `/`              |
| 基站管理 | `/stations`      |
| 基站详情 | `/stations/:id`  |
| 故障日志 | `/faults`        |
| 故障地图 | `/map`           |
| 诊断建议 | `/diagnosis/:id` |
| 模型评估 | `/metrics`       |
| 移动预警 | `/mobile-alert`  |

### 组件规则

1. React 组件使用 PascalCase。
2. API 请求统一放在 `frontend/src/api/`。
3. 页面状态优先使用 React state/hooks 管理，跨页面共享状态再抽公共 hook。
4. 图表组件通过 props 接收数据，不在组件内部直接请求接口。
5. Tailwind 可直接用于模板，但重复布局应抽成组件。
6. 页面组件负责编排，复杂业务判断放到 hook、API 层或后端。

### 视觉规则

1. 使用管理系统风格，信息清晰、密度适中。
2. 状态颜色固定：正常绿色，预警黄色，严重红色，离线灰色。
3. 表格支持筛选、排序和状态显示。
4. 图表必须有标题、单位和清晰坐标含义。
5. 移动预警页优先展示严重故障、位置和处理建议。

## API 规范

后端业务接口统一以 `/api` 为前缀。

| 接口                         | 方法 | 用途             |
| ---------------------------- | ---- | ---------------- |
| `/api/dashboard/summary`     | GET  | 获取监控总览指标 |
| `/api/stations`              | GET  | 获取基站列表     |
| `/api/stations/{station_id}` | GET  | 获取单个基站详情 |
| `/api/metrics/realtime`      | GET  | 获取实时运行指标 |
| `/api/faults`                | GET  | 查询故障日志     |
| `/api/faults/{fault_id}`     | GET  | 查看故障详情     |
| `/api/faults/detect`         | POST | 执行异常检测     |
| `/api/faults/classify`       | POST | 执行故障分类     |
| `/api/diagnosis/{fault_id}`  | GET  | 获取诊断建议     |
| `/api/model/evaluation`      | GET  | 获取模型评估结果 |
| `/api/simulation/run`        | POST | 触发模拟数据生成 |

统一成功响应：

```json
{
  "success": true,
  "data": {},
  "message": ""
}
```

统一失败响应：

```json
{
  "success": false,
  "data": null,
  "message": "error reason"
}
```

## 最小可运行标准

源码工程至少满足以下条件才算阶段闭环完成：

1. 能生成不少于 3000 条通信网络运行数据。
2. 能注入至少 4 类故障。
3. 能训练异常检测模型和故障分类模型。
4. 能输出准确率、召回率、F1、混淆矩阵和定位误差。
5. 能将基站、指标、故障日志和诊断记录写入 SQLite。
6. FastAPI 核心接口可调用。
7. React 前端能展示总览、基站、故障、地图、诊断和模型评估。
8. 有基础测试覆盖数据模拟、模型评估和关键 API。

## 测试和验证

开发时应优先补充以下测试：

1. 数据模拟输出字段完整。
2. 故障注入标签分布合理。
3. 特征工程输出维度稳定。
4. 模型训练可以在固定随机种子下复现。
5. API 返回结构符合统一格式。
6. 前端构建通过。

后端测试使用 Pytest。前端至少保证 TypeScript 检查和 Vite 构建通过。

## 依赖管理

Python 依赖维护在 `requirements.txt` 或后续后端专用依赖文件中。

前端依赖维护在 `frontend/package.json`。

不要在源码中提交第三方依赖目录、虚拟环境、缓存文件或大型临时模型文件。

## 修改优先级

代码开发按以下顺序推进：

1. 后端数据模拟和故障注入。
2. 后端特征工程和模型训练。
3. 后端评估指标和 SQLite 存储。
4. FastAPI 核心接口。
5. React 前端骨架和路由。
6. 总览、故障日志和模型评估页面。
7. 地图、诊断建议和移动预警页面。
8. 测试、构建、运行说明和演示数据。

## 禁止事项

1. 不在源码目录内编写课程报告正文。
2. 不让前端直接读取本地数据库或模型文件。
3. 不把模型训练逻辑写进 API 路由函数主体。
4. 不伪造模型指标。
5. 不提交虚拟环境、node_modules、缓存和临时文件。
6. 不为了复杂算法破坏主流程可运行性。

