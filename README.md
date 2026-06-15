# 基于 AI 的智能通信故障检测与诊断系统

本项目是《通信工程综合设计 II》题目 5 的源码工程，目标是构建一个面向通信网络运维场景的智能故障检测与诊断系统。系统围绕通信网络运行指标，完成数据采集与模拟、异常检测、故障分类、故障定位、诊断建议、日志统计与前端可视化展示的完整闭环。

## 项目能力

当前系统已经具备以下能力：

1. 接入并整理通信网络参考数据集，生成统一的基站、网络指标、故障样本和诊断知识数据。
2. 覆盖信道干扰、信号中断/覆盖退化、带宽不足、基站故障、误码过高等典型通信故障。
3. 使用 Isolation Forest 执行通信网络异常检测，判断样本是否异常。
4. 使用 Random Forest 执行故障类型分类，输出预测类别、置信度和各类别概率。
5. 保存基站、运行指标、故障日志、诊断记录和模型评估结果到 SQLite。
6. 提供 FastAPI 后端接口，支持总览统计、基站查询、故障查询、在线检测、在线分类、诊断建议和模型评估。
7. 提供 React + Vite 前端管理系统，展示监控总览、基站管理、故障日志、故障地图、诊断建议、模型评估和移动预警页面。
8. 保留模型评估指标、混淆矩阵、定位误差分布图和前端联调截图，可支撑课程设计报告和答辩材料。

当前数据与模型规模：

| 项目 | 当前结果 |
| --- | ---: |
| 基站数量 | 188 |
| 网络指标记录 | 263,994 |
| 故障日志记录 | 4,592 |
| 诊断知识记录 | 19 |
| 异常检测准确率 | 84.75% |
| 故障分类准确率 | 99.30% |
| 平均定位误差 | 96.25 m |

说明：异常检测准确率和定位误差仍未达到指导书建议目标，后续报告中应如实说明测试条件和优化方向，不应伪造指标。

## 系统结构

论文和答辩建议按功能模块理解系统：

```text
通信网络数据 -> 异常检测 -> 故障分类 -> 故障定位 -> 诊断建议 -> 日志统计与可视化 -> 前端展示
```

主要功能模块：

```text
基于AI的智能通信故障检测与诊断系统
├─ 数据采集与模拟模块
├─ 故障检测模块
├─ 故障分类模块
├─ 故障定位模块
├─ 诊断建议模块
├─ 日志统计与可视化模块
└─ 前端展示模块
```

详细结构说明见：

```text
docs/system_function_structure.md
```

## 技术栈

后端：

```text
Python, FastAPI, Uvicorn, NumPy, Pandas, Scikit-learn, SQLite, Joblib, Matplotlib, Pytest
```

前端：

```text
React, Vite, TypeScript, Tailwind CSS, Axios, ECharts, Leaflet
```

## 目录说明

```text
lecture_design_02/
  backend/
    src/
      api/                 # FastAPI 应用和路由
      data_ingestion/      # 数据集接入与统一表生成
      feature_engine/      # 特征工程
      models/              # 模型训练和在线推理
      database/            # SQLite schema、初始化和查询封装
    data/
      processed/           # 处理后的 CSV 数据
      app.db               # SQLite 数据库
    saved_models/          # Joblib 模型文件
    reports/               # 模型评估结果和图表
    tests/                 # 后端测试

  frontend/
    src/
      api/                 # 前端 API 封装
      components/          # 通用组件
      pages/               # React 页面
      types/               # TypeScript 类型

  docs/                    # 设计文档、阶段记录和系统结构说明
```

## 环境准备

建议使用 Python 3.10+ 和 Node.js 20+。

在源码工程根目录执行：

```powershell
cd D:\CODE\lesson_design_02\main\lecture_design_02
```

安装 Python 依赖：

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

安装前端依赖：

```powershell
cd frontend
npm install
cd ..
```

## 数据、模型和数据库生成

仓库当前已经包含处理后的数据、模型文件和 SQLite 数据库。若需要从参考数据重新生成，可按以下顺序执行。

生成统一中间数据：

```powershell
python -m backend.src.data_ingestion.build_phase2_dataset
```

训练异常检测和故障分类模型：

```powershell
python -m backend.src.models.train_phase2
```

初始化 SQLite 数据库：

```powershell
python -m backend.src.database.init_db
```

生成后的关键产物：

```text
backend/data/processed/
backend/saved_models/
backend/reports/model_evaluation.json
backend/data/app.db
```

## 启动后端

在源码工程根目录执行：

```powershell
uvicorn backend.src.api.app:app --reload --host 127.0.0.1 --port 8000
```

后端服务地址：

```text
http://127.0.0.1:8000
```

FastAPI 文档地址：

```text
http://127.0.0.1:8000/docs
```

## 启动前端

另开一个终端：

```powershell
cd D:\CODE\lesson_design_02\main\lecture_design_02\frontend
npm run dev
```

前端开发服务默认地址：

```text
http://127.0.0.1:5173
```

前端通过 Vite 代理访问后端：

```text
/api -> http://localhost:8000
```

## 核心 API

后端业务接口统一以 `/api` 为前缀。

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/dashboard/summary` | GET | 获取监控总览统计 |
| `/api/stations` | GET | 获取基站列表 |
| `/api/stations/{station_id}` | GET | 获取基站详情 |
| `/api/metrics/realtime` | GET | 获取近期网络指标 |
| `/api/faults` | GET | 查询故障日志 |
| `/api/faults/{fault_id}` | GET | 获取故障详情 |
| `/api/faults/detect` | POST | 加载模型并执行异常检测 |
| `/api/faults/classify` | POST | 加载模型并执行故障分类 |
| `/api/diagnosis/{fault_id}` | GET | 获取诊断建议 |
| `/api/model/evaluation` | GET | 获取模型评估结果 |
| `/api/simulation/run` | POST | 检查处理后数据是否可用 |

在线推理示例：

```powershell
Invoke-RestMethod -Method Post "http://127.0.0.1:8000/api/faults/detect?limit=5"
Invoke-RestMethod -Method Post "http://127.0.0.1:8000/api/faults/classify?limit=5"
```

`detect` 会返回异常得分、阈值和是否异常；`classify` 会返回预测故障类型、置信度和各类别概率。

## 前端页面

| 页面 | 路由 |
| --- | --- |
| 监控总览 | `/` |
| 基站管理 | `/stations` |
| 基站详情 | `/stations/:id` |
| 故障日志 | `/faults` |
| 故障地图 | `/map` |
| 诊断建议 | `/diagnosis/:id` |
| 模型评估 | `/metrics` |
| 移动预警 | `/mobile-alert` |

推荐演示路线：

```text
监控总览 -> 故障日志 -> 故障地图 -> 诊断建议 -> 模型评估 -> 移动预警
```

## 测试与构建

运行后端测试：

```powershell
pytest backend\tests -q
```

构建前端：

```powershell
cd frontend
npm run build
```

当前验证结果：

```text
pytest backend\tests -q
19 passed
```

```text
npm run build
通过
```

说明：前端构建时可能出现 Vite chunk size warning，主要来自 ECharts 和 Leaflet 等可视化依赖，不影响当前课程设计演示运行。

## 报告与截图材料

开发文档位于：

```text
docs/
```

报告、截图和测试结果材料位于项目根目录的：

```text
D:\CODE\lesson_design_02\报告
```

其中阶段四前端联调截图位于：

```text
D:\CODE\lesson_design_02\报告\截图素材\阶段四前端联调
```

## 当前限制与后续优化

当前系统已经形成可运行闭环，但仍有以下待增强点：

1. 异常检测准确率当前为 84.75%，低于指导书建议的 95%，后续可结合规则阈值或重新平衡训练样本优化。
2. 平均定位误差当前为 96.25 m，高于指导书建议的 50 m，后续可改进加权质心定位或加入更多定位特征。
3. 在线检测和分类接口已经可以返回推理结果，但推理结果尚未自动写回 `fault_logs`，后续可补充“检测结果入库”的闭环。
4. 数据字段中 `latency`、`packet_loss`、`device_status` 等指标仍可继续补强，用于更完整地说明通信故障机理。
