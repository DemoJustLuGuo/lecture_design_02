# 阶段三后端系统开发验收总结

## 1. 阶段三范围

阶段三目标是把阶段二生成的数据、模型和评估结果接入后端系统，形成可供前端调用的数据库和 API 服务。

本阶段重点包括：

1. 建立 SQLite 数据库表。
2. 将基站、运行指标、故障日志、诊断记录和模型评估结果写入数据库。
3. 提供 FastAPI 核心业务接口。
4. 提供故障查询、诊断建议和模型评估结果接口。
5. 补充后端测试，验证数据库和 API 返回结构。

阶段三不展开前端页面联调，前端完整演示流程放到阶段四推进。

## 2. 阶段三正式产物

### 2.1 SQLite 数据库

数据库文件位于：

```text
backend/data/app.db
```

数据库大小约为：

```text
69.9 MB
```

数据库包含以下核心表：

| 表名 | 作用 |
| --- | --- |
| `base_stations` | 保存基站和小区工参信息 |
| `network_metrics` | 保存通信网络运行指标 |
| `fault_logs` | 保存故障检测、分类、定位和处理状态 |
| `diagnosis_records` | 保存故障根因和运维建议 |
| `model_evaluations` | 保存模型评估指标、混淆矩阵和检测耗时 |

数据库 schema 位于：

```text
backend/src/database/schema.sql
```

### 2.2 阶段三数据库写入验收结果

阶段三验收时的数据库统计结果：

| 表名 | 行数 |
| --- | ---: |
| `base_stations` | 188 |
| `network_metrics` | 263,994 |
| `fault_logs` | 4,592 |
| `diagnosis_records` | 19 |
| `model_evaluations` | 2 |

该数据规模能够支撑监控总览、故障日志、诊断建议、模型评估和后续地图展示。

2026-06-18 更新：为演示“系统从空白状态导入/生成数据并完成分析”的流程，当前运行态 SQLite 文件 `backend/data/app.db` 已清空业务数据并保留表结构。当前空库行数为：

| 表名 | 当前行数 |
| --- | ---: |
| `base_stations` | 0 |
| `network_metrics` | 0 |
| `fault_logs` | 0 |
| `diagnosis_records` | 0 |
| `model_evaluations` | 0 |

阶段三写入结果仍作为后端验收记录保留；当前空库状态是演示运行态选择，不代表阶段二/阶段三数据产物丢失。可通过设置页或 `POST /api/simulation/run` 将阶段数据重新写入 SQLite。

## 3. 后端模块结构

阶段三后端新增或完善的主要模块包括：

```text
backend/src/api/
backend/src/api/routes/
backend/src/database/
```

主要职责如下：

| 模块 | 职责 |
| --- | --- |
| `backend/src/api/app.py` | 创建 FastAPI 应用并注册业务路由 |
| `backend/src/api/routes/` | 按业务域提供 REST API |
| `backend/src/database/db.py` | 数据库路径和连接封装 |
| `backend/src/database/init_db.py` | 根据阶段二产物初始化 SQLite 数据库 |
| `backend/src/database/repository.py` | 封装数据库查询，避免 API 路由直接拼接业务查询 |
| `backend/src/database/schema.sql` | 定义 SQLite 表结构和索引 |

当前 API 路由通过 repository 层访问数据库，符合源码级规范中“API 路由不得直接拼接 SQL，应通过 repository 层访问数据库”的要求。

## 4. 核心 API 接口

阶段三已提供以下接口：

| 接口 | 方法 | 当前作用 |
| --- | --- | --- |
| `/api/dashboard/summary` | GET | 获取监控总览统计 |
| `/api/stations` | GET | 获取基站列表 |
| `/api/stations/{station_id}` | GET | 获取基站详情和近期指标 |
| `/api/metrics/realtime` | GET | 获取实时运行指标列表 |
| `/api/faults` | GET | 获取故障日志列表 |
| `/api/faults/{fault_id}` | GET | 获取单条故障详情 |
| `/api/faults/{fault_id}/status` | PATCH | 更新故障处理状态 |
| `/api/faults/detect` | POST | 返回异常检测模型可用状态，可选写入故障日志 |
| `/api/faults/classify` | POST | 返回故障分类模型可用状态，可选写入故障日志 |
| `/api/diagnosis/{fault_id}` | GET | 获取指定故障的规则诊断建议 |
| `/api/diagnosis/{fault_id}?enhance=llm` | GET | 使用后端环境变量尝试大模型增强诊断 |
| `/api/diagnosis/{fault_id}/enhance` | POST | 使用前端传入配置触发大模型增强诊断 |
| `/api/model/evaluation` | GET | 获取模型评估结果 |
| `/api/simulation/run` | POST | 重新加载阶段二处理数据到 SQLite |
| `/api/simulation/generate` | POST | 生成合成演示数据 |
| `/api/simulation/generate-area` | POST | 按地图区域生成合成演示数据 |
| `/api/simulation/commit-preview` | POST | 将预览数据写入 SQLite |
| `/api/simulation/import` | POST | 导入外部 CSV 网络指标数据 |

2026-06-18 更新：诊断接口已经扩展为规则诊断和可选大模型增强诊断两种模式。大模型增强失败时返回规则诊断结果，并在 `display.llm_error` 中保留失败原因，保证演示流程稳定。

接口统一返回结构：

```json
{
  "success": true,
  "data": {},
  "message": ""
}
```

错误场景使用统一失败结构，例如资源不存在时返回：

```json
{
  "detail": {
    "success": false,
    "data": null,
    "message": "station not found"
  }
}
```

## 5. 接口冒烟验证

使用 FastAPI `TestClient` 对核心接口进行冒烟验证，结果如下：

| 接口 | 状态码 | 结果 |
| --- | ---: | --- |
| `GET /api/dashboard/summary` | 200 | `success: true` |
| `GET /api/stations?limit=1` | 200 | `success: true` |
| `GET /api/metrics/realtime?limit=2` | 200 | `success: true` |
| `GET /api/faults?limit=1` | 200 | `success: true` |
| `GET /api/model/evaluation` | 200 | `success: true` |
| `POST /api/faults/detect` | 200 | `success: true` |
| `POST /api/faults/classify` | 200 | `success: true` |
| `POST /api/simulation/run` | 200 | `success: true` |
| `GET /api/faults/{fault_id}` | 200 | `success: true` |
| `GET /api/diagnosis/{fault_id}` | 200 | `success: true` |
| `PATCH /api/faults/{fault_id}/status` | 200 | `success: true` |
| `POST /api/diagnosis/{fault_id}/enhance` | 200 | mock 环境下 `success: true` |

示例故障编号：

```text
TS_anomalous__synthetic__Zone_C__Twitch_00016
```

该故障详情接口和诊断建议接口均可正常返回数据。

## 6. 后端测试结果

在源码工程根目录执行：

```powershell
cd D:\CODE\lesson_design_02\main\lecture_design_02
pytest backend\tests -q
```

测试结果：

```text
19 passed in 2.99s
```

测试覆盖内容包括：

1. 阶段二中间表和模型产物存在性。
2. 数据字段和故障类型覆盖情况。
3. 数据库文件存在性和 repository 查询。
4. 监控总览、基站、故障、诊断、指标和模型评估 API。
5. 模型文件状态接口和数据加载状态接口。
6. 资源不存在时的错误响应结构。

## 7. 阶段三验收结论

阶段三已完成后端系统开发的主要闭环：

```text
阶段二数据和模型产物 -> SQLite 数据库 -> Repository 查询层 -> FastAPI 核心接口 -> 后端测试验证
```

按当前工程计划，阶段三可作为“后端查询和演示接口闭环已完成”进行归档。当前后端已经能够支撑阶段四前端页面接入，包括监控总览、基站管理、故障日志、故障详情、诊断建议、模型评估和模拟数据状态展示。

后续阶段四应重点推进：

1. 前端页面与上述 API 的联调。
2. 统一处理加载态、空状态和接口错误提示。
3. 固定用于答辩演示的故障样本和诊断路线。
4. 生成系统截图素材，服务课程设计报告和答辩 PPT。
