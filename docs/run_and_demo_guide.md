# 运行与答辩演示指南

更新时间：2026-06-18

## 1. 文档用途

本文档用于答辩现场启动、排错和演示流程说明。当前系统刻意保持 `backend/data/app.db` 运行态数据库为空白，便于展示“从未输入数据到生成/导入数据，再完成故障分析和诊断”的完整流程。

## 2. 启动前检查

在 PowerShell 中进入源码工程根目录：

```powershell
cd D:\CODE\lesson_design_02\main\lecture_design_02
```

建议确认以下内容：

| 检查项 | 说明 |
| --- | --- |
| Python 依赖 | 后端依赖已按 `requirements.txt` 安装 |
| Node 依赖 | 前端已执行过 `npm install` |
| 运行态数据库 | `backend/data/app.db` 可为空，但表结构需要存在 |
| 阶段数据 | `backend/data/processed/` 保留演示数据来源 |
| 模型文件 | `backend/saved_models/` 保留异常检测和分类模型 |

当前空库不是异常状态。空库下页面会展示引导，提示前往设置页生成、导入或重载数据。

## 3. 启动服务

启动后端：

```powershell
.\scripts\start_backend.ps1
```

后端默认地址：

```text
http://127.0.0.1:8000
```

另开一个 PowerShell 窗口启动前端：

```powershell
.\scripts\start_frontend.ps1
```

前端默认地址：

```text
http://127.0.0.1:5173
```

## 4. 健康检查

服务启动后执行：

```powershell
.\scripts\health_check.ps1
```

预期结果：

| 检查项 | 成功表现 |
| --- | --- |
| Backend | `/api/dashboard/summary` 返回 200 |
| Frontend proxy | 前端代理 `/api/dashboard/summary` 返回 200 |

若前端页面提示“数据加载失败”，优先确认后端是否已启动，再执行健康检查脚本定位是后端不可达、前端代理失败还是接口本身错误。

## 5. 演示路线

推荐从空库状态开始：

1. 打开前端首页，展示监控总览空状态，说明系统当前尚未输入运行数据。
2. 进入“系统设置”，查看“演示流程状态”面板，说明当前处于“空白待输入”阶段。
3. 在“数据表管理”中选择一种数据接入方式：
   - `重载 processed 数据`：将阶段数据写入 SQLite，适合快速恢复标准演示数据。
   - `生成预览数据`：生成合成数据但先不写入数据库，确认后点击“写入 SQLite”。
   - `选择 CSV 并导入`：追加导入外部标准网络指标 CSV。
4. 写入数据后，设置页会自动刷新系统状态。
5. 进入监控总览，展示基站数量、故障数量、故障类型分布和趋势。
6. 进入故障日志，选择一条故障进入诊断页。
7. 展示规则诊断结果，包括根因分析、关键症状、处理建议、影响范围和复核理由。
8. 如需展示大模型增强能力，先在设置页保存 OpenAI 兼容 API 配置，再在诊断页点击“AI增强诊断”。
9. 在诊断页演示“采纳建议”和“导出报告”，说明运维闭环已经形成。
10. 进入故障地图和模型评估页，展示定位结果、定位误差范围、准确率、F1 和混淆矩阵。

## 6. 大模型配置

大模型增强诊断不是系统必需依赖。未配置或调用失败时，诊断页会保留规则诊断结果并提示失败原因。

前端设置页支持配置：

| 字段 | 说明 |
| --- | --- |
| Base URL | OpenAI 兼容接口根地址，例如 `https://api.openai.com/v1` |
| Model | 模型名称 |
| Timeout | 请求超时时间，范围 1 到 60 秒 |
| API Key | 接口密钥，保存到浏览器 localStorage |

也可以使用本地演示配置文件：

```text
frontend/public/llm-config.local.json
```

该文件已加入 `.gitignore`，不会提交到版本库。示例格式见：

```text
frontend/public/llm-config.example.json
```

## 7. 验证命令

后端测试：

```powershell
python -m pytest backend/tests
```

前端演示资产校验：

```powershell
cd frontend
npm run validate:demo
```

前端构建：

```powershell
cd frontend
npm run build
```

当前前端已经对 React、Router、Axios、Leaflet 和 ECharts 做分包，并对 ECharts 使用按需注册。正常构建不应再出现 Vite 大 chunk warning。

## 8. 报告引用口径

报告中可说明：系统支持空白运行态启动，并通过设置页完成演示数据重载、合成数据生成和外部 CSV 导入；数据写入后，监控总览、故障日志、故障地图、诊断建议和模型评估页面自动形成完整展示链路。大模型 API 仅作为诊断建议增强层，规则诊断始终作为稳定兜底。
