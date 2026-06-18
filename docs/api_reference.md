# API 接口参考

更新时间：2026-06-18

## 1. 通用约定

后端服务地址：

```text
http://127.0.0.1:8000
```

所有业务接口统一使用 `/api` 前缀，成功响应结构如下：

```json
{
  "success": true,
  "data": {},
  "message": ""
}
```

错误响应统一包含原因说明：

```json
{
  "success": false,
  "data": null,
  "message": "fault not found"
}
```

部分 FastAPI 校验错误会出现在 `detail` 字段中，前端 Axios 层已统一转换为可读错误提示。

## 2. 监控总览

| 接口 | 方法 | 参数 | 用途 | 前端页面 |
| --- | --- | --- | --- | --- |
| `/api/dashboard/summary` | GET | 无 | 返回基站数、故障数、严重故障数、分类准确率、F1、检测耗时和故障类型统计 | 监控总览、设置页 |
| `/api/dashboard/fault-trend` | GET | `days`，默认 7 | 返回最近 N 天故障总数和严重故障趋势 | 监控总览 |

## 3. 基站与指标

| 接口 | 方法 | 参数 | 用途 | 前端页面 |
| --- | --- | --- | --- | --- |
| `/api/stations` | GET | `limit`，默认 200 | 查询基站列表 | 基站管理、地图 |
| `/api/stations/{station_id}` | GET | 路径参数 `station_id` | 查询单个基站详情、近期指标和近期故障 | 基站详情 |
| `/api/metrics/realtime` | GET | `limit`，默认 200 | 查询近期网络运行指标 | 监控总览、地图 |

## 4. 故障日志与模型推理

| 接口 | 方法 | 参数 | 用途 | 前端页面 |
| --- | --- | --- | --- | --- |
| `/api/faults` | GET | `fault_type`、`fault_level`、`status`、`source`、`limit` | 查询故障日志列表，支持筛选 | 故障日志、移动预警 |
| `/api/faults/{fault_id}` | GET | 路径参数 `fault_id` | 查询单条故障详情 | 故障日志、诊断页 |
| `/api/faults/{fault_id}/status` | PATCH | JSON：`{"status":"处理中"}` | 更新故障处理状态 | 诊断页 |
| `/api/faults/detect` | POST | `limit`、`metric_id`、`source_dataset`、`persist` | 对运行指标执行异常检测，可选择写入故障结果 | 调试/扩展接口 |
| `/api/faults/classify` | POST | `limit`、`metric_id`、`source_dataset`、`persist` | 对运行指标执行故障分类，可选择写入故障结果 | 调试/扩展接口 |

故障状态当前支持：

```text
未处理、处理中、已处理、关闭
```

## 5. 诊断建议

| 接口 | 方法 | 参数 | 用途 | 前端页面 |
| --- | --- | --- | --- | --- |
| `/api/diagnosis/{fault_id}` | GET | 路径参数 `fault_id` | 返回规则诊断结果 | 诊断页 |
| `/api/diagnosis/{fault_id}?enhance=llm` | GET | 查询参数 `enhance=llm` | 使用后端环境变量尝试大模型增强诊断 | 可选调试 |
| `/api/diagnosis/{fault_id}/enhance` | POST | JSON：`base_url`、`api_key`、`model`、`timeout_seconds` | 使用前端设置页配置触发大模型增强诊断 | 诊断页 |

诊断输出重点字段：

| 字段 | 说明 |
| --- | --- |
| `display.source_label` | 标识“规则诊断”或“大模型增强诊断” |
| `display.root_cause` | 根因分析 |
| `display.key_symptoms` | 关键症状 |
| `display.suggested_actions` | 运维处理建议 |
| `display.affected_scope` | 影响范围 |
| `display.review_required` | 是否建议人工复核 |
| `display.review_reason` | 复核原因 |
| `display.llm_enhanced` | 是否成功使用大模型增强 |
| `display.llm_error` | 大模型失败时的回退原因 |

## 6. 模型评估

| 接口 | 方法 | 参数 | 用途 | 前端页面 |
| --- | --- | --- | --- | --- |
| `/api/model/evaluation` | GET | 无 | 返回模型评估记录、混淆矩阵、定位误差和检测耗时 | 模型评估 |

## 7. 数据生成与导入

| 接口 | 方法 | 参数 | 用途 | 前端页面 |
| --- | --- | --- | --- | --- |
| `/api/simulation/run` | POST | 无 | 将 `backend/data/processed/` 标准数据重新写入 SQLite | 设置页 |
| `/api/simulation/generate` | POST | `station_count`、`metric_count`、`fault_ratio`、`seed`、`refresh_db` | 生成合成演示数据；`refresh_db=false` 时只生成预览 | 设置页 |
| `/api/simulation/generate-area` | POST | `min_lng`、`min_lat`、`max_lng`、`max_lat`、`station_count`、`metric_count`、`fault_ratio`、`seed`、`enable_triangulation`、`refresh_db` | 按地图框选区域生成演示数据 | 故障地图 |
| `/api/simulation/commit-preview` | POST | `preview_id` | 将预览批次写入 SQLite | 设置页 |
| `/api/simulation/import` | POST | multipart：`network_metrics`、可选 `base_stations`、`source_name`、`batch_note` | 追加导入外部标准 CSV 网络数据 | 设置页 |

CSV 字段模板见：

| 模板 | 位置 |
| --- | --- |
| `network_metrics` | `frontend/public/templates/network_metrics_template.csv` |
| `base_stations` | `frontend/public/templates/base_stations_template.csv` |

字段解释见 `docs/data_import_template.md`。

## 8. 空库行为

当前演示态数据库可以为空。空库下接口仍应保持可调用：

| 接口 | 空库返回 |
| --- | --- |
| `/api/dashboard/summary` | 计数为 0，准确率和耗时为 `null` |
| `/api/stations` | 空数组 |
| `/api/faults` | 空数组 |
| `/api/model/evaluation` | 空评估列表 |
| `/api/diagnosis/{fault_id}` | 不存在的 `fault_id` 返回统一 404 |

前端页面会显示空状态引导，不再将空库误报为系统加载失败。
