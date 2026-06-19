import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchDashboardSummary } from '@/api/dashboard'
import {
  commitSimulationPreview,
  generateSimulationData,
  importSimulationData,
  runSimulationRefresh,
} from '@/api/simulation'
import {
  defaultLlmConfig,
  loadLocalLlmConfig,
  loadStoredLlmConfig,
  normalizeLlmConfig,
  saveLlmConfig,
  type LlmConfigForm,
} from '@/utils/llmConfig'
import type {
  DashboardSummary,
  SimulationGenerateResult,
  SimulationImportResult,
  SimulationResult,
} from '@/types/api'

type Message = {
  tone: 'success' | 'error' | 'info'
  text: string
}

type DataActionResult =
  | { kind: 'refresh'; data: SimulationResult }
  | { kind: 'generate'; data: SimulationGenerateResult }
  | { kind: 'import'; data: SimulationImportResult }

type DemoStepState = 'done' | 'active' | 'pending' | 'optional'

type DemoStep = {
  title: string
  value: string
  detail: string
  state: DemoStepState
}

function countText(value: number | undefined): string {
  return value == null ? '--' : value.toLocaleString('zh-CN')
}

function percentText(value: number | null | undefined): string {
  return value == null ? '--' : `${(value * 100).toFixed(1)}%`
}

function stepStateClass(state: DemoStepState): string {
  const classes: Record<DemoStepState, string> = {
    done: 'border-tertiary/30 bg-tertiary-container/30 text-tertiary',
    active: 'border-primary/30 bg-primary-container/40 text-primary',
    pending: 'border-outline-variant bg-surface-container-low text-on-surface-variant',
    optional: 'border-outline-variant bg-surface text-on-surface-variant',
  }
  return classes[state]
}

function stepDotClass(state: DemoStepState): string {
  const classes: Record<DemoStepState, string> = {
    done: 'bg-tertiary',
    active: 'bg-primary',
    pending: 'bg-outline',
    optional: 'bg-outline-variant',
  }
  return classes[state]
}

function tableLabel(key: string): string {
  const labels: Record<string, string> = {
    base_stations: '基站数据',
    network_metrics: '网络指标',
    fault_logs: '故障日志',
    diagnosis_records: '诊断记录',
    model_evaluations: '模型评估',
    fault_samples: '故障样本',
    diagnosis_knowledge: '诊断知识',
    location_samples: '定位样本',
    root_cause_samples: '根因样本',
  }
  return labels[key] ?? key
}

function actionText(result: DataActionResult | null): string {
  if (!result) return ''
  if (result.kind === 'refresh') return result.data.message || 'SQLite 数据已刷新。'
  if (result.kind === 'generate') return result.data.message || '合成数据已生成。'
  return result.data.message || '外部 CSV 已导入。'
}

export default function Settings() {
  const importInputRef = useRef<HTMLInputElement>(null)
  const baseStationInputRef = useRef<HTMLInputElement>(null)
  const [llmConfig, setLlmConfig] = useState<LlmConfigForm>(() => loadStoredLlmConfig())
  const [message, setMessage] = useState<Message | null>(null)
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [dataResult, setDataResult] = useState<DataActionResult | null>(null)
  const [pendingGeneration, setPendingGeneration] = useState<SimulationGenerateResult | null>(null)
  const [baseStationCsv, setBaseStationCsv] = useState<File | null>(null)
  const [generateForm, setGenerateForm] = useState({
    station_count: 20,
    metric_count: 5000,
    fault_ratio: 0.15,
    seed: 42,
  })

  const loadSystemStatus = useCallback(async () => {
    setStatusLoading(true)
    setStatusError(null)
    try {
      const result = await fetchDashboardSummary()
      setSummary(result)
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : '系统状态读取失败。')
    } finally {
      setStatusLoading(false)
    }
  }, [])

  useEffect(() => {
    loadLocalLlmConfig()
      .then((config) => {
        if (!config) return
        setLlmConfig((current) => normalizeLlmConfig({ ...current, ...config }))
      })
      .catch(() => {
        // Local demo config is optional.
      })
  }, [])

  useEffect(() => {
    void loadSystemStatus()
  }, [loadSystemStatus])

  const normalizedLlmConfig = useMemo(() => normalizeLlmConfig(llmConfig), [llmConfig])
  const hasRuntimeData = Boolean(summary && (summary.station_count > 0 || summary.fault_count > 0))
  const hasFaults = Boolean(summary && summary.fault_count > 0)
  const hasModelEvaluation = Boolean(
    summary &&
      (summary.classification_accuracy != null ||
        summary.classification_f1 != null ||
        summary.detection_latency_ms != null),
  )
  const hasLlmConfig = normalizedLlmConfig.api_key.trim().length > 0
  const hasPreview = Boolean(pendingGeneration?.preview_id)

  const demoSteps = useMemo<DemoStep[]>(() => {
    return [
      {
        title: '1. 运行态数据库',
        value: hasRuntimeData ? '已有演示数据' : '空白待输入',
        detail: hasRuntimeData
          ? `当前 ${countText(summary?.station_count)} 个基站、${countText(summary?.fault_count)} 条故障。`
          : '当前 SQLite 业务表为空，适合从设置页开始演示数据接入。',
        state: hasRuntimeData ? 'done' : 'active',
      },
      {
        title: '2. 数据准备',
        value: hasPreview ? '预览待写入' : hasRuntimeData ? '已写入 SQLite' : '待生成或导入',
        detail: hasPreview
          ? `预览批次 ${pendingGeneration?.preview_id} 已生成，确认后写入 SQLite。`
          : hasRuntimeData
            ? '可直接进入监控总览、故障日志和模型评估页面。'
            : '可重载 processed 数据、生成合成数据或导入标准 CSV。',
        state: hasPreview ? 'active' : hasRuntimeData ? 'done' : 'pending',
      },
      {
        title: '3. 故障分析',
        value: hasFaults ? '可进入诊断流程' : '暂无故障日志',
        detail: hasFaults
          ? `其中严重故障 ${countText(summary?.severe_fault_count)} 条，可在故障日志中进入诊断。`
          : '写入数据后，故障日志和地图会展示检测、分类和定位结果。',
        state: hasFaults ? 'done' : hasRuntimeData ? 'active' : 'pending',
      },
      {
        title: '4. 模型评估',
        value: hasModelEvaluation ? '评估指标可展示' : '暂无评估记录',
        detail: hasModelEvaluation
          ? `分类准确率 ${percentText(summary?.classification_accuracy)}，F1 ${percentText(summary?.classification_f1)}。`
          : '写入阶段数据后，可在模型评估页展示准确率、F1 和定位误差。',
        state: hasModelEvaluation ? 'done' : hasRuntimeData ? 'active' : 'pending',
      },
      {
        title: '5. AI 增强诊断',
        value: hasLlmConfig ? '已配置 API Key' : '可选配置',
        detail: hasLlmConfig
          ? `诊断页将使用 ${normalizedLlmConfig.model || '当前模型'} 尝试增强建议。`
          : '未配置时仍使用规则诊断，演示不会依赖外部网络。',
        state: hasLlmConfig ? 'done' : 'optional',
      },
    ]
  }, [
    hasFaults,
    hasLlmConfig,
    hasModelEvaluation,
    hasPreview,
    hasRuntimeData,
    normalizedLlmConfig.model,
    pendingGeneration?.preview_id,
    summary?.classification_accuracy,
    summary?.classification_f1,
    summary?.fault_count,
    summary?.severe_fault_count,
    summary?.station_count,
  ])

  const nextAction = hasPreview
    ? '下一步：点击“写入 SQLite”，再进入监控总览查看新数据。'
    : hasRuntimeData
      ? '下一步：进入故障日志选择样本，打开诊断建议并按需触发 AI 增强。'
      : '下一步：在数据表管理中重载 processed 数据、生成合成数据或导入 CSV。'

  const handleSaveLlmConfig = () => {
    const normalized = normalizeLlmConfig(llmConfig)
    saveLlmConfig(normalized)
    setLlmConfig(normalized)
    setMessage({ tone: 'success', text: '大模型配置已保存到浏览器本地。诊断页会直接使用该配置。' })
  }

  const handleResetLlmConfig = () => {
    const defaults = defaultLlmConfig()
    saveLlmConfig(defaults)
    setLlmConfig(defaults)
    setMessage({ tone: 'info', text: '大模型配置已恢复默认值。' })
  }

  const handleRefreshProcessed = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await runSimulationRefresh()
      setDataResult({ kind: 'refresh', data: result })
      setPendingGeneration(null)
      await loadSystemStatus()
      setMessage({ tone: 'success', text: '已将当前 processed 数据重载到 SQLite，并刷新系统状态。' })
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : '重载 SQLite 失败。' })
    } finally {
      setBusy(false)
    }
  }

  const handleGeneratePreview = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await generateSimulationData({ ...generateForm, refresh_db: false })
      setDataResult({ kind: 'generate', data: result })
      setPendingGeneration(result)
      setMessage({ tone: 'success', text: '合成数据预览已生成，确认后可写入 SQLite。' })
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : '合成数据生成失败。' })
    } finally {
      setBusy(false)
    }
  }

  const handleCommitPreview = async () => {
    if (!pendingGeneration?.preview_id) {
      setMessage({ tone: 'error', text: '缺少预览批次 ID，无法写入 SQLite。' })
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const result = await commitSimulationPreview(pendingGeneration.preview_id)
      setDataResult({ kind: 'refresh', data: result })
      setPendingGeneration(null)
      await loadSystemStatus()
      setMessage({ tone: 'success', text: '预览数据已写入 SQLite，并刷新系统状态。' })
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : '写入 SQLite 失败。' })
    } finally {
      setBusy(false)
    }
  }

  const handleImportCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await importSimulationData({
        networkMetrics: file,
        baseStations: baseStationCsv,
        sourceName: 'settings_upload',
        batchNote: 'settings_page_import',
      })
      setDataResult({ kind: 'import', data: result })
      setPendingGeneration(null)
      setBaseStationCsv(null)
      if (baseStationInputRef.current) baseStationInputRef.current.value = ''
      await loadSystemStatus()
      setMessage({ tone: 'success', text: '外部标准 CSV 已追加导入 SQLite，并刷新系统状态。' })
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'CSV 导入失败。' })
    } finally {
      setBusy(false)
    }
  }

  const refreshResult = dataResult?.kind === 'refresh' ? dataResult.data : null
  const generateResult = dataResult?.kind === 'generate' ? dataResult.data : null
  const importResult = dataResult?.kind === 'import' ? dataResult.data : null

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-gutter animate-fade-in">
      <div className="flex flex-col gap-1">
        <h1 className="font-headline-md text-headline-md text-on-surface">系统设置</h1>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          管理大模型诊断配置和演示数据源。SQLite 文件级替换暂不开放，当前提供重载、生成和标准 CSV 导入三种安全方式。
        </p>
      </div>

      {message ? (
        <div
          className={[
            'rounded-lg border px-4 py-3 text-body-sm font-body-sm',
            message.tone === 'success'
              ? 'border-tertiary/30 bg-tertiary-container text-on-tertiary-container'
              : message.tone === 'error'
                ? 'border-error/30 bg-error-container text-on-error-container'
                : 'border-outline-variant bg-surface-container-low text-on-surface-variant',
          ].join(' ')}
        >
          {message.text}
        </div>
      ) : null}

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-card-padding">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="material-symbols-outlined text-primary text-[22px]">route</span>
              <h2 className="font-title-lg text-title-lg text-on-surface">演示流程状态</h2>
            </div>
            <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
              根据当前 SQLite、预览批次和大模型配置判断系统所处步骤，避免空库演示时误认为数据加载异常。
            </p>
          </div>
          <button
            className="min-h-11 rounded-lg border border-outline-variant bg-surface px-4 py-2 text-body-sm font-body-sm text-on-surface hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-70"
            type="button"
            onClick={() => void loadSystemStatus()}
            disabled={statusLoading || busy}
          >
            {statusLoading ? '刷新中...' : '刷新状态'}
          </button>
        </div>

        {statusError ? (
          <div className="mb-4 rounded-lg border border-error/30 bg-error-container px-4 py-3 text-body-sm font-body-sm text-on-error-container">
            {statusError}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
          {demoSteps.map((step) => (
            <div key={step.title} className={['rounded-lg border p-3', stepStateClass(step.state)].join(' ')}>
              <div className="mb-2 flex items-center gap-2">
                <span className={['h-2.5 w-2.5 rounded-full', stepDotClass(step.state)].join(' ')} />
                <span className="font-label-caps text-[10px] uppercase tracking-normal">{step.title}</span>
              </div>
              <div className="font-title-sm text-title-sm text-on-surface">{step.value}</div>
              <p className="mt-1 min-h-14 font-body-sm text-body-sm text-on-surface-variant">{step.detail}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          <div className="rounded-lg border border-outline-variant bg-surface px-3 py-2">
            <div className="font-label-caps text-[10px] text-on-surface-variant uppercase">基站</div>
            <div className="font-data-mono text-data-mono text-on-surface">{countText(summary?.station_count)}</div>
          </div>
          <div className="rounded-lg border border-outline-variant bg-surface px-3 py-2">
            <div className="font-label-caps text-[10px] text-on-surface-variant uppercase">故障</div>
            <div className="font-data-mono text-data-mono text-on-surface">{countText(summary?.fault_count)}</div>
          </div>
          <div className="rounded-lg border border-outline-variant bg-surface px-3 py-2">
            <div className="font-label-caps text-[10px] text-on-surface-variant uppercase">严重故障</div>
            <div className="font-data-mono text-data-mono text-on-surface">{countText(summary?.severe_fault_count)}</div>
          </div>
          <div className="rounded-lg border border-outline-variant bg-surface px-3 py-2">
            <div className="font-label-caps text-[10px] text-on-surface-variant uppercase">分类准确率</div>
            <div className="font-data-mono text-data-mono text-on-surface">
              {percentText(summary?.classification_accuracy)}
            </div>
          </div>
          <div className="rounded-lg border border-outline-variant bg-surface px-3 py-2">
            <div className="font-label-caps text-[10px] text-on-surface-variant uppercase">大模型</div>
            <div className="font-data-mono text-data-mono text-on-surface">{hasLlmConfig ? '已配置' : '未配置'}</div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-primary/30 bg-primary-container/30 px-4 py-3 font-body-sm text-body-sm text-on-surface">
          {nextAction}
        </div>
      </section>

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-card-padding">
        <div className="mb-4 flex items-center gap-2">
          <span aria-hidden="true" className="material-symbols-outlined text-primary text-[22px]">auto_awesome</span>
          <h2 className="font-title-lg text-title-lg text-on-surface">大模型 API 设置</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <label className="flex flex-col gap-1.5">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">接口地址</span>
            <input
              className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-body-sm font-body-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              value={llmConfig.base_url}
              onChange={(event) => setLlmConfig((config) => ({ ...config, base_url: event.target.value }))}
              placeholder="https://api.openai.com/v1"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">模型</span>
            <input
              className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-body-sm font-body-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              value={llmConfig.model}
              onChange={(event) => setLlmConfig((config) => ({ ...config, model: event.target.value }))}
              placeholder="gpt-4o-mini"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">超时时间</span>
            <input
              className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-body-sm font-body-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              type="number"
              min={1}
              max={60}
              value={llmConfig.timeout_seconds}
              onChange={(event) => setLlmConfig((config) => ({ ...config, timeout_seconds: Number(event.target.value) }))}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">API 密钥</span>
            <input
              className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-body-sm font-body-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              value={llmConfig.api_key}
              onChange={(event) => setLlmConfig((config) => ({ ...config, api_key: event.target.value }))}
              placeholder="sk-..."
              type="password"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-col gap-3 border-t border-outline-variant/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            配置保存在浏览器 localStorage；也可用已忽略的 frontend/public/llm-config.local.json 预置演示配置。
          </p>
          <div className="flex gap-2">
            <button
              className="rounded-lg border border-outline-variant bg-surface px-4 py-2 text-body-sm font-body-sm text-on-surface hover:bg-surface-container-low"
              type="button"
              onClick={handleResetLlmConfig}
            >
              恢复默认
            </button>
            <button
              className="rounded-lg bg-primary px-4 py-2 text-body-sm font-body-sm text-on-primary hover:bg-primary/90"
              type="button"
              onClick={handleSaveLlmConfig}
            >
              保存配置
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-card-padding">
        <div className="mb-4 flex items-center gap-2">
          <span aria-hidden="true" className="material-symbols-outlined text-primary text-[22px]">database</span>
          <h2 className="font-title-lg text-title-lg text-on-surface">数据表管理</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-outline-variant bg-surface p-4">
            <h3 className="font-title-sm text-title-sm text-on-surface">重载当前数据表</h3>
            <p className="mt-2 min-h-12 font-body-sm text-body-sm text-on-surface-variant">
              将 backend/data/processed 中的标准数据重新写入 SQLite，适合演示前恢复默认数据。
            </p>
            <button
              className="mt-4 w-full rounded-lg bg-primary px-4 py-2 text-body-sm font-body-sm text-on-primary hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
              type="button"
              onClick={handleRefreshProcessed}
              disabled={busy}
            >
              重载 processed 数据
            </button>
          </div>

          <div className="rounded-lg border border-outline-variant bg-surface p-4">
            <h3 className="font-title-sm text-title-sm text-on-surface">生成合成数据</h3>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="font-label-caps text-[10px] text-on-surface-variant uppercase">基站数</span>
                <input
                  className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-body-sm"
                  type="number"
                  min={1}
                  max={500}
                  value={generateForm.station_count}
                  onChange={(event) => setGenerateForm((form) => ({ ...form, station_count: Number(event.target.value) }))}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-label-caps text-[10px] text-on-surface-variant uppercase">指标数</span>
                <input
                  className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-body-sm"
                  type="number"
                  min={1}
                  max={200000}
                  value={generateForm.metric_count}
                  onChange={(event) => setGenerateForm((form) => ({ ...form, metric_count: Number(event.target.value) }))}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-label-caps text-[10px] text-on-surface-variant uppercase">故障比例</span>
                <input
                  className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-body-sm"
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={generateForm.fault_ratio}
                  onChange={(event) => setGenerateForm((form) => ({ ...form, fault_ratio: Number(event.target.value) }))}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-label-caps text-[10px] text-on-surface-variant uppercase">随机种子</span>
                <input
                  className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-body-sm"
                  type="number"
                  value={generateForm.seed}
                  onChange={(event) => setGenerateForm((form) => ({ ...form, seed: Number(event.target.value) }))}
                />
              </label>
            </div>
            <button
              className="mt-4 w-full rounded-lg border border-primary/30 bg-primary-container px-4 py-2 text-body-sm font-body-sm text-primary hover:bg-primary-container/80 disabled:cursor-not-allowed disabled:opacity-70"
              type="button"
              onClick={handleGeneratePreview}
              disabled={busy}
            >
              生成预览数据
            </button>
          </div>

          <div className="rounded-lg border border-outline-variant bg-surface p-4">
            <h3 className="font-title-sm text-title-sm text-on-surface">导入标准 CSV</h3>
            <p className="mt-2 min-h-12 font-body-sm text-body-sm text-on-surface-variant">
              上传 network_metrics 格式的 CSV。该方式是追加导入，不直接替换整个 SQLite 文件。
            </p>
            <input
              ref={baseStationInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => setBaseStationCsv(event.target.files?.[0] ?? null)}
            />
            <input
              ref={importInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleImportCsv}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-1.5 text-body-sm font-body-sm text-on-surface hover:bg-surface-container"
                href="/templates/network_metrics_template.csv"
                download
              >
                下载指标模板
              </a>
              <a
                className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-1.5 text-body-sm font-body-sm text-on-surface hover:bg-surface-container"
                href="/templates/base_stations_template.csv"
                download
              >
                下载基站模板
              </a>
            </div>
            <button
              className="mt-3 w-full rounded-lg border border-outline-variant bg-surface px-4 py-2 text-body-sm font-body-sm text-on-surface hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-70"
              type="button"
              onClick={() => baseStationInputRef.current?.click()}
              disabled={busy}
            >
              {baseStationCsv ? `已选择基站 CSV：${baseStationCsv.name}` : '选择基站 CSV（可选）'}
            </button>
            <button
              className="mt-3 w-full rounded-lg border border-outline-variant bg-surface px-4 py-2 text-body-sm font-body-sm text-on-surface hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-70"
              type="button"
              onClick={() => importInputRef.current?.click()}
              disabled={busy}
            >
              选择指标 CSV 并导入
            </button>
          </div>
        </div>

        {pendingGeneration?.preview_id ? (
          <div className="mt-4 rounded-lg border border-primary/30 bg-primary-container/30 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-title-sm text-title-sm text-on-surface">待写入预览批次</h3>
                <p className="font-data-mono text-data-mono text-on-surface-variant">{pendingGeneration.preview_id}</p>
              </div>
              <button
                className="rounded-lg bg-primary px-4 py-2 text-body-sm font-body-sm text-on-primary hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                type="button"
                onClick={handleCommitPreview}
                disabled={busy}
              >
                写入 SQLite
              </button>
            </div>
          </div>
        ) : null}

        {dataResult ? (
          <div className="mt-4 rounded-lg border border-outline-variant bg-surface-container-low p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-title-sm text-title-sm text-on-surface">最近一次数据操作</h3>
              <span className="font-body-sm text-body-sm text-on-surface-variant">{actionText(dataResult)}</span>
            </div>
            {refreshResult ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                {Object.entries(refreshResult.after_counts ?? {}).map(([key, value]) => (
                  <div key={key} className="rounded-lg border border-outline-variant bg-surface px-3 py-2">
                    <div className="font-label-caps text-[10px] text-on-surface-variant uppercase">{tableLabel(key)}</div>
                    <div className="font-data-mono text-data-mono text-on-surface">{countText(value)}</div>
                  </div>
                ))}
              </div>
            ) : null}
            {generateResult ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {Object.entries(generateResult.generated_files ?? {}).map(([key, value]) => (
                  <div key={key} className="rounded-lg border border-outline-variant bg-surface px-3 py-2">
                    <div className="font-label-caps text-[10px] text-on-surface-variant uppercase">{tableLabel(key)}</div>
                    <div className="font-data-mono text-data-mono text-on-surface">{countText(value)}</div>
                  </div>
                ))}
              </div>
            ) : null}
            {importResult ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-outline-variant bg-surface px-3 py-2">
                  <div className="font-label-caps text-[10px] text-on-surface-variant uppercase">批次</div>
                  <div className="truncate font-data-mono text-data-mono text-on-surface">{importResult.batch_id}</div>
                </div>
                <div className="rounded-lg border border-outline-variant bg-surface px-3 py-2">
                  <div className="font-label-caps text-[10px] text-on-surface-variant uppercase">写入</div>
                  <div className="font-data-mono text-data-mono text-on-surface">{countText(importResult.inserted_count)}</div>
                </div>
                <div className="rounded-lg border border-outline-variant bg-surface px-3 py-2">
                  <div className="font-label-caps text-[10px] text-on-surface-variant uppercase">跳过</div>
                  <div className="font-data-mono text-data-mono text-on-surface">{countText(importResult.skipped_count)}</div>
                </div>
                <div className="rounded-lg border border-outline-variant bg-surface px-3 py-2">
                  <div className="font-label-caps text-[10px] text-on-surface-variant uppercase">错误</div>
                  <div className="font-data-mono text-data-mono text-on-surface">{countText(importResult.error_count)}</div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  )
}
