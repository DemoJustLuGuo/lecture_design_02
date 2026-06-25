# 前端页面与接口对照

> 本文档列出前端 10 个页面的路由、调用接口与主要组件，供课程报告"界面设计"章节引用。
> 技术栈：React + Vite + Tailwind + Axios + ECharts + Leaflet。接口细节见
> [`api_reference.md`](./api_reference.md)。

## 1. 路由与页面（`frontend/src/router.tsx`）

| 页面 | 路由 | 组件文件 | 调用 API 模块 → 后端接口 |
| --- | --- | --- | --- |
| 监控总览 | `/` | `pages/Dashboard.tsx` | `dashboard`→`/api/dashboard/summary`、`/api/dashboard/fault-trend`；`faults`→检测/分类；`simulation`→快捷数据操作 |
| 基站管理 | `/stations` | `pages/StationMgmt.tsx` | `stations`→`/api/stations` |
| 基站详情 | `/stations/:id` | `pages/StationDetail.tsx` | `stations`→`/api/stations/{id}` |
| 故障日志 | `/faults` | `pages/FaultLogs.tsx` | `faults`→`/api/faults`、`PATCH /api/faults/{id}/status` |
| 故障地图 | `/map` | `pages/FaultMap.tsx` | `faults`→`/api/faults`；`stations`→`/api/stations`；`simulation` |
| 诊断建议 | `/diagnosis/:id`、`/faults/:id/diagnosis` | `pages/Diagnosis.tsx` | `diagnosis`→`/api/diagnosis/{id}`、`POST /api/diagnosis/{id}/enhance`；`faults`→状态更新 |
| 模型评估 | `/metrics` | `pages/ModelEval.tsx` | `metrics`→`/api/model/evaluation` |
| 移动预警 | `/mobile-alert` | `pages/MobileAlert.tsx` | `faults`→`/api/faults` |
| 设置与数据管理 | `/settings` | `pages/Settings.tsx` | `dashboard`→系统状态；`simulation`→`run`/`generate`/`generate-area`/`commit-preview`/`import`；`utils/llmConfig` |
| 404 | `*` | `pages/NotFound.tsx` | 无 |

> 后端接口 `/api/metrics/realtime` 已提供，当前未绑定固定页面，可供实时指标扩展使用。

## 2. API 封装层（`frontend/src/api/`）

| 模块 | 导出函数 | 对应后端 |
| --- | --- | --- |
| `client.ts` | `unwrap` + axios 实例 | 统一 `baseURL=/api`、拦截器解包 `{success,data,message}`、错误归类 |
| `dashboard.ts` | `fetchDashboardSummary`、`fetchFaultTrend` | `/api/dashboard/summary`、`/api/dashboard/fault-trend` |
| `stations.ts` | `fetchStations`、`fetchStationDetail` | `/api/stations`、`/api/stations/{id}` |
| `faults.ts` | `fetchFaults`、`fetchFaultDetail`、`detectFaults`、`classifyFaults`、`updateFaultStatus` | `/api/faults*`、`/api/faults/detect`、`/api/faults/classify` |
| `diagnosis.ts` | `fetchDiagnosis`、`enhanceDiagnosis` | `/api/diagnosis/{id}`、`POST /api/diagnosis/{id}/enhance` |
| `metrics.ts` | `fetchModelEvaluation` | `/api/model/evaluation` |
| `simulation.ts` | `runSimulationRefresh`、`generateSimulationData`、`generateAreaSimulationData`、`commitSimulationPreview`、`importSimulationData` | `/api/simulation/*` |

约定：API 请求统一在 `api/` 层；页面组件负责编排，复杂逻辑下沉到 hook/API/后端；
图表组件通过 props 接收数据，不在内部直接请求接口。

## 3. 组件（`frontend/src/components/`）

| 组件 | 职责 |
| --- | --- |
| `Sidebar.tsx` / `Header.tsx` / `MobileNav.tsx` / `BreadcrumbNav.tsx` | 布局：侧边导航、顶部状态栏、移动端导航、面包屑 |
| `MetricCard.tsx` | 关键指标卡片 |
| `StatusBadge.tsx` | 状态徽标（正常绿/预警黄/严重红/离线灰） |
| `ChartPanel.tsx` | 图表容器（ECharts，按需注册） |
| `EmptyState.tsx` | 空库引导（提示前往设置页导入/生成数据） |

辅助：`hooks/useECharts.ts`（图表实例）、`hooks/useCountUp.ts`（数字动效）、
`utils/llmConfig.ts`（前端 LLM 配置读写校验）、`theme.ts`（设计令牌）。

## 4. 视觉与交互约定

- 管理系统风格，信息密度优先，首屏进入监控总览，无营销式首页。
- 状态色固定：正常绿、预警黄、严重红、离线灰。
- 表格支持按故障类型/严重程度/时间筛选；图表带标题、单位与坐标含义。
- 移动预警页优先展示严重故障、位置与处理建议。
- 空库状态下各页给出前往设置页的数据准备引导（演示流程"从无到有"）。
