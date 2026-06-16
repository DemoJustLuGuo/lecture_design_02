import { useEffect, useRef, useState } from 'react'
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
import type { SimulationGenerateResult, SimulationImportResult, SimulationResult } from '@/types/api'

type Message = {
  tone: 'success' | 'error' | 'info'
  text: string
}

type DataActionResult =
  | { kind: 'refresh'; data: SimulationResult }
  | { kind: 'generate'; data: SimulationGenerateResult }
  | { kind: 'import'; data: SimulationImportResult }

function countText(value: number | undefined): string {
  return value == null ? '--' : value.toLocaleString('zh-CN')
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
  const [llmConfig, setLlmConfig] = useState<LlmConfigForm>(() => loadStoredLlmConfig())
  const [message, setMessage] = useState<Message | null>(null)
  const [busy, setBusy] = useState(false)
  const [dataResult, setDataResult] = useState<DataActionResult | null>(null)
  const [pendingGeneration, setPendingGeneration] = useState<SimulationGenerateResult | null>(null)
  const [generateForm, setGenerateForm] = useState({
    station_count: 20,
    metric_count: 5000,
    fault_ratio: 0.15,
    seed: 42,
  })

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
      setMessage({ tone: 'success', text: '已将当前 processed 数据重载到 SQLite。' })
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
      setMessage({ tone: 'success', text: '预览数据已写入 SQLite，刷新页面即可查看新数据。' })
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
        sourceName: 'settings_upload',
        batchNote: 'settings_page_import',
      })
      setDataResult({ kind: 'import', data: result })
      setPendingGeneration(null)
      setMessage({ tone: 'success', text: '外部标准 CSV 已追加导入 SQLite。' })
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
        <div className="mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[22px]">auto_awesome</span>
          <h2 className="font-title-lg text-title-lg text-on-surface">大模型 API 设置</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <label className="flex flex-col gap-1.5">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">Base URL</span>
            <input
              className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-body-sm font-body-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              value={llmConfig.base_url}
              onChange={(event) => setLlmConfig((config) => ({ ...config, base_url: event.target.value }))}
              placeholder="https://api.openai.com/v1"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">Model</span>
            <input
              className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-body-sm font-body-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              value={llmConfig.model}
              onChange={(event) => setLlmConfig((config) => ({ ...config, model: event.target.value }))}
              placeholder="gpt-4o-mini"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">Timeout</span>
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
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">API Key</span>
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
          <span className="material-symbols-outlined text-primary text-[22px]">database</span>
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
                <span className="font-label-caps text-[10px] text-on-surface-variant uppercase">Seed</span>
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
              ref={importInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleImportCsv}
            />
            <button
              className="mt-4 w-full rounded-lg border border-outline-variant bg-surface px-4 py-2 text-body-sm font-body-sm text-on-surface hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-70"
              type="button"
              onClick={() => importInputRef.current?.click()}
              disabled={busy}
            >
              选择 CSV 并导入
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
