# 系统架构与数据流

> 本文档描述系统总体架构、五条核心数据链路、模块依赖方向与关键时序，供课程报告
> "总体设计/功能设计（流程图、时序图）"章节引用。组件细节见
> [`model_layer_and_detection.md`](./model_layer_and_detection.md)、
> [`diagnosis_subsystem.md`](./diagnosis_subsystem.md)、[`database_schema.md`](./database_schema.md)、
> [`api_reference.md`](./api_reference.md)。

## 1. 总体架构

前后端分离 + 离线建模 + 运行态 SQLite。

```mermaid
flowchart TB
    subgraph FE[前端 React/Vite/Tailwind]
        PAGES[10 页面] --> AX[Axios api/ 封装]
    end
    AX -- /api --> API[FastAPI 路由]
    subgraph BE[后端 FastAPI]
        API --> SVC[业务层 models / diagnosis]
        SVC --> REPO[Repository 仓储层]
        REPO --> DB[(SQLite app.db)]
        SVC --> ART[saved_models/*.joblib]
    end
    subgraph OFFLINE[离线]
        DS[data_sim / data_ingestion] --> PROC[(processed/*.csv)]
        PROC --> TRAIN[models/train.py] --> ART
        TRAIN --> REP[(reports/model_evaluation.json + figures)]
    end
    PROC --> REPO
    REP --> REPO
```

路径统一由 `backend/src/utils/config.py` 提供。

## 2. 五条核心链路

### 2.1 离线建模链路

```mermaid
flowchart LR
    RAW[参考文件/datasets] --> BUILD[build_phase2_dataset]
    BUILD --> PROC[(processed/*.csv)]
    PROC --> FE[feature_engine: 两套特征管线]
    FE --> SPLIT[StratifiedGroupKFold 按 scenario_id]
    SPLIT --> AD[异常检测融合: 监督RF+规则+IF]
    SPLIT --> FC[故障分类 RF + 低置信度复核]
    AD --> EVAL[evaluate]
    FC --> EVAL
    EVAL --> SM[saved_models/*.joblib]
    EVAL --> RJ[reports/model_evaluation.json]
    EVAL --> FIG[visualization: 混淆矩阵/定位误差图]
```

定位主指标单独由 `localization_benchmark` 在合成真值场景评估（见模型层文档）。

### 2.2 数据入库链路（三入口 → SQLite）

```mermaid
flowchart LR
    R1[/api/simulation/run] --> RD[demo_loader.refresh_demo_database]
    R2[/api/simulation/generate*] --> GEN[synthetic_generator] --> RD
    R3[/api/simulation/import] --> IMP[external_importer]
    RD --> INIT[init_db.initialize_database]
    INIT --> DB[(SQLite 五表)]
    IMP --> DB
    IMP --> BATCH[(data_import_batches/errors)]
```

预览模式生成的数据经 `/api/simulation/commit-preview` 再写库。

### 2.3 在线推理链路

```mermaid
flowchart LR
    REQ[/api/faults/detect or classify] --> RM[Repository.inference_metrics]
    RM --> DBq[(network_metrics)]
    REQ --> INF[detect_anomalies / classify_faults]
    INF --> ARTq[load_model_artifacts]
    INF --> OUT[预测+置信度/异常分数+复核标记]
    OUT -- persist=True --> PERSIST[Repository.persist_inference_results]
    PERSIST --> DBw[(fault_logs + diagnosis_records)]
```

### 2.4 诊断链路

```mermaid
flowchart LR
    DREQ[/api/diagnosis/id] --> SVC[DiagnosisService]
    SVC --> RREAD[Repository.diagnosis_for_fault]
    RREAD --> RULE[rules.build_diagnosis_display 规则兜底]
    SVC -- enhance=llm / POST enhance --> LLM[llm_adapter.complete_json]
    LLM -- 成功 --> MERGE[合并进 display]
    LLM -- 失败/未配置 --> RULE
```

### 2.5 前端展示链路

```mermaid
flowchart LR
    PAGE[页面] --> APIc[api/*.ts] --> CLIENT[axios client 解包 success/data/message]
    CLIENT --> PROXY[Vite 代理 /api] --> ROUTE[FastAPI 路由]
    ROUTE --> REPO[Repository] --> DB[(SQLite)]
```

## 3. 模块依赖方向（无环）

```mermaid
flowchart TD
    routes --> models_ad[models.anomaly_detector]
    routes --> models_fc[models.fault_classifier]
    routes --> diag[diagnosis.service]
    routes --> repo[database.repository]
    models_ad --> artifacts[models.artifacts]
    models_fc --> artifacts
    artifacts --> fe[feature_engine]
    artifacts --> cfg[utils.config]
    train[models.train] --> models_ad
    train --> models_fc
    train --> evaluate[models.evaluate]
    train --> viz[visualization]
    train --> bench[models.localization_benchmark]
    datasim[data_sim.synthetic_generator] --> locator[models.locator]
    repo --> db[database.db] --> cfg
    diag --> rules[diagnosis.rules]
    diag --> llm[diagnosis.llm_adapter]
```

要点：路径单一来源 `utils.config`；指标/绘图/定位已与训练脚本解耦；`data_sim` 依赖
`models.locator`（定位几何），无反向依赖，故无环。

## 4. 关键时序：一次"检测→分类→诊断"

```mermaid
sequenceDiagram
    participant U as 前端
    participant A as FastAPI
    participant R as Repository
    participant M as 模型层
    participant D as DiagnosisService
    U->>A: POST /api/faults/classify?persist=true
    A->>R: inference_metrics() 取样本
    R-->>A: network_metrics 记录
    A->>M: classify_faults(records)
    M->>M: 加载工件 + 特征变换 + 预测 + 置信度/复核
    M-->>A: 预测结果(含 review_required)
    A->>R: persist_inference_results()
    R-->>A: 写入 fault_logs/diagnosis_records
    A-->>U: success(data)
    U->>A: GET /api/diagnosis/{fault_id}?enhance=llm
    A->>D: diagnosis_for_fault(enhance=llm)
    D->>R: 读故障+规则诊断
    D->>D: LLM 增强(失败回退规则)
    D-->>A: 结构化 display
    A-->>U: success(data)
```

## 5. 一句话总结

原始数据→构建 processed→离线训练出模型与评估图 → 三种方式把数据灌进 SQLite →
运行时从库取样做检测/分类并回写故障 → 规则(+可选 LLM)生成诊断 → React 各页面经
`/api` 统一读展。
