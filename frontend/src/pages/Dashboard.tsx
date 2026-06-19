import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { MetricCard } from '@/components/MetricCard'
import { ChartPanel } from '@/components/ChartPanel'
import { StatusBadge } from '@/components/StatusBadge'
import { EmptyState } from '@/components/EmptyState'
import { fetchDashboardSummary, fetchFaultTrend } from '@/api/dashboard'
import { fetchFaults } from '@/api/faults'
import { commitSimulationPreview, generateSimulationData, importSimulationData, runSimulationRefresh } from '@/api/simulation'
import { useCountUp } from '@/hooks/useCountUp'
import { useECharts } from '@/hooks/useECharts'
import { COLORS, mergeOption } from '@/theme'
import type {
  DashboardSummary,
  FaultLog,
  FaultTrendItem,
  SimulationGenerateResult,
  SimulationImportResult,
  SimulationResult,
} from '@/types/api'
import { FaultLevel } from '@/types/enums'

/* ── Helpers ─────────────────────────────────────────────────── */

function formatTime(value: string | null): string {
  if (!value) return '--'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  const yyyy = parsed.getFullYear()
  const mm = String(parsed.getMonth() + 1).padStart(2, '0')
  const dd = String(parsed.getDate()).padStart(2, '0')
  const hh = String(parsed.getHours()).padStart(2, '0')
  const mi = String(parsed.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}

function severityBadgeStatus(level: string | null): 'critical' | 'warning' | 'info' | 'normal' | 'offline' {
  if (level === FaultLevel.Critical || level === '严重') return 'critical'
  if (level === FaultLevel.Warning || level === '预警' || level === '警告') return 'warning'
  if (level === FaultLevel.Info || level === '一般' || level === '提示') return 'info'
  return 'info'
}

function describeFault(fault: FaultLog): string {
  const type = fault.fault_type_cn || '未知故障'
  const station = fault.station_id ? `基站 ${fault.station_id}` : '未知基站'
  return `${type}，${station}`
}

function formatCount(value: number | undefined): string {
  if (value == null) return '--'
  return value.toLocaleString('zh-CN')
}

function formatDuration(value: number | undefined): string {
  if (value == null) return '--'
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`
  return `${Math.round(value)}ms`
}

function formatGeneratedFileLabel(key: string): string {
  const labels: Record<string, string> = {
    base_stations: '基站数据',
    network_metrics: '网络指标',
    fault_samples: '故障样本',
    diagnosis_knowledge: '诊断知识',
    location_samples: '定位样本',
    root_cause_samples: '根因样本',
    triangulation_observations: '三基站观测',
  }
  return labels[key] ?? key
}

function countDelta(result: SimulationResult, key: string): string {
  const before = result.before_counts?.[key]
  const after = result.after_counts?.[key]
  if (after == null) return '--'
  if (before == null) return formatCount(after)
  const delta = after - before
  if (delta === 0) return formatCount(after)
  return `${formatCount(after)} (${delta > 0 ? '+' : ''}${formatCount(delta)})`
}

type SimulationActionResult =
  | { kind: 'refresh'; data: SimulationResult }
  | { kind: 'generate'; data: SimulationGenerateResult }
  | { kind: 'import'; data: SimulationImportResult }

function actionMessage(result: SimulationActionResult | null, error: string | null): string {
  if (error) return error
  if (!result) return ''
  if (result.kind === 'refresh') return result.data.message || '演示数据刷新完成。'
  if (result.kind === 'generate') return result.data.message || '合成演示数据生成完成。'
  return result.data.message || '外部网络数据导入完成。'
}

/* ── Dashboard Page ──────────────────────────────────────────── */

export default function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [faults, setFaults] = useState<FaultLog[]>([])
  const [trendData, setTrendData] = useState<FaultTrendItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshingDemo, setRefreshingDemo] = useState(false)
  const [generatingDemo, setGeneratingDemo] = useState(false)
  const [persistingGeneratedDemo, setPersistingGeneratedDemo] = useState(false)
  const [importingDemo, setImportingDemo] = useState(false)
  const [simulationResult, setSimulationResult] = useState<SimulationActionResult | null>(null)
  const [simulationError, setSimulationError] = useState<string | null>(null)
  const [pendingGeneration, setPendingGeneration] = useState<SimulationGenerateResult | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  const loadDashboardData = useCallback(async () => {
    const [summaryData, faultsData, trend] = await Promise.all([
      fetchDashboardSummary(),
      fetchFaults(5),
      fetchFaultTrend(7),
    ])
    setSummary(summaryData)
    setFaults(faultsData)
    setTrendData(trend.items)
  }, [])

  useEffect(() => {
    loadDashboardData()
      .catch((err) => setError(err.message || '数据加载失败'))
      .finally(() => setLoading(false))
  }, [loadDashboardData])

  const handleRefreshDemoData = useCallback(async () => {
    setRefreshingDemo(true)
    setSimulationError(null)
    try {
      const result = await runSimulationRefresh()
      setSimulationResult({ kind: 'refresh', data: result })
      await loadDashboardData()
    } catch (err) {
      setSimulationError(err instanceof Error ? err.message : '演示数据刷新失败')
    } finally {
      setRefreshingDemo(false)
    }
  }, [loadDashboardData])

  const handleGenerateDemoData = useCallback(async () => {
    setGeneratingDemo(true)
    setSimulationError(null)
    try {
      const result = await generateSimulationData({
        station_count: 20,
        metric_count: 5000,
        fault_ratio: 0.15,
        seed: 42,
        refresh_db: false,
      })
      setSimulationResult({ kind: 'generate', data: result })
      setPendingGeneration(result)
    } catch (err) {
      setSimulationError(err instanceof Error ? err.message : '合成演示数据生成失败')
    } finally {
      setGeneratingDemo(false)
    }
  }, [])

  const handleImportFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setImportingDemo(true)
    setSimulationError(null)
    try {
      const result = await importSimulationData({
        networkMetrics: file,
        sourceName: 'external_upload',
        batchNote: 'dashboard_upload',
      })
      setSimulationResult({ kind: 'import', data: result })
      await loadDashboardData()
    } catch (err) {
      setSimulationError(err instanceof Error ? err.message : '外部网络数据导入失败')
    } finally {
      setImportingDemo(false)
    }
  }, [loadDashboardData])

  const handlePersistGeneratedDemo = useCallback(async () => {
    if (!pendingGeneration?.preview_id) {
      setSimulationError('缺少预览批次ID，无法写入 SQLite。')
      return
    }
    setPersistingGeneratedDemo(true)
    setSimulationError(null)
    try {
      const result = await commitSimulationPreview(pendingGeneration.preview_id)
      setSimulationResult({ kind: 'refresh', data: result })
      setPendingGeneration(null)
      await loadDashboardData()
    } catch (err) {
      setSimulationError(err instanceof Error ? err.message : '写入 SQLite 失败')
    } finally {
      setPersistingGeneratedDemo(false)
    }
  }, [loadDashboardData, pendingGeneration])

  const handleDiscardGeneratedDemo = useCallback(() => {
    setPendingGeneration(null)
    setSimulationResult(null)
    setSimulationError(null)
  }, [])

  const busy = refreshingDemo || generatingDemo || importingDemo || persistingGeneratedDemo
  const refreshResult = simulationResult?.kind === 'refresh' ? simulationResult.data : null
  const generateResult = simulationResult?.kind === 'generate' ? simulationResult.data : null
  const importResult = simulationResult?.kind === 'import' ? simulationResult.data : null
  const isEmptyDatabase = Boolean(
    summary
    && summary.station_count === 0
    && summary.fault_count === 0
    && faults.length === 0,
  )

  /* ── Count-up animated values ──────────────────────────── */
  const stationValue = useCountUp(summary?.station_count ?? 0, 1000)
  const faultValue = useCountUp(summary?.fault_count ?? 0, 1000)
  const severeValue = useCountUp(summary?.severe_fault_count ?? 0, 1000)
  const accuracyValue = useCountUp((summary?.classification_accuracy ?? 0) * 100, 1000, '%')

  /* ── ECharts: Trend line ──────────────────────────────── */
  const trendRef = useRef<HTMLDivElement>(null)

  const trendOptionFactory = useCallback(() => mergeOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: 'rgba(42, 20, 180, 0.2)', width: 2 } },
    },
    grid: { left: '2%', right: '4%', bottom: '3%', top: '10%', containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: trendData.map((d) => d.label),
    },
    yAxis: {
      type: 'value',
      name: '条',
    },
    series: [
      {
        name: '告警总数',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: false,
        itemStyle: { color: COLORS.primary },
        lineStyle: { width: 3, color: COLORS.primary },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(42, 20, 180, 0.2)' },
              { offset: 1, color: 'rgba(42, 20, 180, 0.0)' },
            ],
          } as unknown as string,
        },
        data: trendData.map((d) => d.total),
      },
      {
        name: '严重故障',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: false,
        itemStyle: { color: COLORS.error },
        lineStyle: { width: 2, color: COLORS.error, type: 'dashed' },
        data: trendData.map((d) => d.severe),
      },
    ],
  }), [trendData])

  useECharts(trendRef, trendOptionFactory)

  /* ── ECharts: Donut pie ───────────────────────────────── */
  const pieRef = useRef<HTMLDivElement>(null)

  const donutData = useMemo(
    () =>
      (summary?.fault_type_counts ?? [])
        .filter((item) => item.fault_type_cn !== '正常')
        .slice(0, 6)
        .map((item) => ({
          name: item.fault_type_cn,
          value: item.count,
        })),
    [summary],
  )

  const pieOptionFactory = useCallback(() => mergeOption({
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)',
    },
    legend: {
      orient: 'horizontal',
      bottom: '0%',
      itemWidth: 8,
      itemHeight: 8,
      icon: 'circle',
    },
    color: COLORS.chartPalette,
    series: [
      {
        name: '故障类型',
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 4,
          borderColor: '#fff',
          borderWidth: 2,
        },
        label: { show: false, position: 'center' },
        emphasis: {
          label: {
            show: true,
            fontSize: 14,
            fontWeight: 'bold',
            formatter: '{c}\n{b}',
          },
        },
        labelLine: { show: false },
        data: donutData,
      },
    ],
  }), [donutData])

  useECharts(pieRef, pieOptionFactory)

  /* ── Loading / Error states ────────────────────────────── */
  if (loading && !summary) {
    return (
      <div className="flex flex-col gap-gutter max-w-7xl mx-auto animate-fade-in">
        <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-card-padding text-body-sm text-on-surface-variant">
          正在加载监控数据...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col gap-gutter max-w-7xl mx-auto animate-fade-in">
        <div className="bg-error-container border border-error/30 rounded-lg p-card-padding text-on-error-container">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-gutter max-w-7xl mx-auto animate-fade-in">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="font-headline-md text-headline-md text-on-surface">监控总览</h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
            当前演示库状态、故障趋势和最新告警。
          </p>
        </div>
        {isEmptyDatabase ? (
          <Link
            to="/settings"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-body-sm font-body-sm text-on-primary shadow-sm transition-colors hover:bg-primary/90"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">database</span>
            进入数据准备
          </Link>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleRefreshDemoData}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-outline-variant bg-surface px-4 py-2 text-body-sm font-body-sm text-on-surface shadow-sm transition-colors hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-70"
            >
              <span aria-hidden="true" className={`material-symbols-outlined text-[18px] ${refreshingDemo ? 'animate-spin-slow' : ''}`}>
                {refreshingDemo ? 'progress_activity' : 'database'}
              </span>
              {refreshingDemo ? '刷新中' : '刷新演示数据'}
            </button>
            <button
              type="button"
              onClick={handleGenerateDemoData}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-body-sm font-body-sm text-on-primary shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <span aria-hidden="true" className={`material-symbols-outlined text-[18px] ${generatingDemo ? 'animate-spin-slow' : ''}`}>
                {generatingDemo ? 'progress_activity' : 'auto_awesome'}
              </span>
              {generatingDemo ? '生成中' : '重新生成数据'}
            </button>
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-body-sm font-body-sm text-primary shadow-sm transition-colors hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <span aria-hidden="true" className={`material-symbols-outlined text-[18px] ${importingDemo ? 'animate-spin-slow' : ''}`}>
                {importingDemo ? 'progress_activity' : 'upload_file'}
              </span>
              {importingDemo ? '导入中' : '导入 CSV'}
            </button>
            <input
              ref={importInputRef}
              className="hidden"
              type="file"
              accept=".csv,text/csv"
              onChange={handleImportFileChange}
            />
          </div>
        )}
      </div>

      {simulationResult || simulationError ? (
        <div
          className={[
            'rounded-lg border p-card-padding shadow-sm',
            simulationError || refreshResult?.database_refreshed === false
              ? 'border-error/30 bg-error-container text-on-error-container'
              : 'border-tertiary/30 bg-tertiary-container text-on-tertiary-container',
          ].join(' ')}
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-2">
              <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
                {simulationError || refreshResult?.database_refreshed === false ? 'error' : 'check_circle'}
              </span>
              <div>
                <div className="font-body-base text-body-base">
                  {actionMessage(simulationResult, simulationError)}
                </div>
                {refreshResult ? (
                  <div className="mt-1 font-data-mono text-data-mono opacity-80">
                    用时 {formatDuration(refreshResult.duration_ms)} · 模式 {refreshResult.mode || 'reload_demo_dataset'}
                  </div>
                ) : null}
                {generateResult ? (
                  <div className="mt-1 font-data-mono text-data-mono opacity-80">
                    生成 {formatCount(generateResult.generated_files.network_metrics)} 条指标 · seed {generateResult.parameters.seed} · 待确认写入
                  </div>
                ) : null}
                {importResult ? (
                  <div className="mt-1 font-data-mono text-data-mono opacity-80">
                    批次 {importResult.batch_id} · 状态 {importResult.status}
                  </div>
                ) : null}
              </div>
            </div>

            {refreshResult ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[520px]">
                <div className="rounded border border-current/20 bg-white/30 px-3 py-2">
                  <div className="font-label-caps text-label-caps uppercase opacity-75">基站</div>
                  <div className="font-data-mono text-data-mono">{countDelta(refreshResult, 'base_stations')}</div>
                </div>
                <div className="rounded border border-current/20 bg-white/30 px-3 py-2">
                  <div className="font-label-caps text-label-caps uppercase opacity-75">指标</div>
                  <div className="font-data-mono text-data-mono">{countDelta(refreshResult, 'network_metrics')}</div>
                </div>
                <div className="rounded border border-current/20 bg-white/30 px-3 py-2">
                  <div className="font-label-caps text-label-caps uppercase opacity-75">故障</div>
                  <div className="font-data-mono text-data-mono">{countDelta(refreshResult, 'fault_logs')}</div>
                </div>
                <div className="rounded border border-current/20 bg-white/30 px-3 py-2">
                  <div className="font-label-caps text-label-caps uppercase opacity-75">诊断</div>
                  <div className="font-data-mono text-data-mono">{countDelta(refreshResult, 'diagnosis_records')}</div>
                </div>
              </div>
            ) : null}
            {generateResult ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[520px]">
                <div className="rounded border border-current/20 bg-white/30 px-3 py-2">
                  <div className="font-label-caps text-label-caps uppercase opacity-75">基站</div>
                  <div className="font-data-mono text-data-mono">{formatCount(generateResult.generated_files.base_stations)}</div>
                </div>
                <div className="rounded border border-current/20 bg-white/30 px-3 py-2">
                  <div className="font-label-caps text-label-caps uppercase opacity-75">指标</div>
                  <div className="font-data-mono text-data-mono">{formatCount(generateResult.generated_files.network_metrics)}</div>
                </div>
                <div className="rounded border border-current/20 bg-white/30 px-3 py-2">
                  <div className="font-label-caps text-label-caps uppercase opacity-75">故障</div>
                  <div className="font-data-mono text-data-mono">{formatCount(generateResult.generated_files.fault_samples)}</div>
                </div>
                <div className="rounded border border-current/20 bg-white/30 px-3 py-2">
                  <div className="font-label-caps text-label-caps uppercase opacity-75">刷新</div>
                  <div className="font-data-mono text-data-mono">{generateResult.refresh?.database_refreshed ? '完成' : '待确认'}</div>
                </div>
              </div>
            ) : null}
            {importResult ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[520px]">
                <div className="rounded border border-current/20 bg-white/30 px-3 py-2">
                  <div className="font-label-caps text-label-caps uppercase opacity-75">写入</div>
                  <div className="font-data-mono text-data-mono">{formatCount(importResult.inserted_count)}</div>
                </div>
                <div className="rounded border border-current/20 bg-white/30 px-3 py-2">
                  <div className="font-label-caps text-label-caps uppercase opacity-75">跳过</div>
                  <div className="font-data-mono text-data-mono">{formatCount(importResult.skipped_count)}</div>
                </div>
                <div className="rounded border border-current/20 bg-white/30 px-3 py-2">
                  <div className="font-label-caps text-label-caps uppercase opacity-75">错误</div>
                  <div className="font-data-mono text-data-mono">{formatCount(importResult.error_count)}</div>
                </div>
                <div className="rounded border border-current/20 bg-white/30 px-3 py-2">
                  <div className="font-label-caps text-label-caps uppercase opacity-75">文件</div>
                  <div className="font-data-mono text-data-mono truncate" title={importResult.network_metrics_filename}>
                    {importResult.network_metrics_filename}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {refreshResult?.missing_files?.length ? (
            <div className="mt-3 rounded border border-current/20 bg-white/20 px-3 py-2 font-data-mono text-data-mono">
              缺失文件：{refreshResult.missing_files.join(', ')}
            </div>
          ) : null}
        </div>
      ) : null}

      {pendingGeneration ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/35 px-4 backdrop-blur-sm">
          <section className="max-h-[86vh] w-full max-w-3xl overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-outline-variant bg-surface-container-lowest px-5 py-4">
              <div>
                <h2 className="font-headline-md text-headline-md text-on-surface">生成数据预览</h2>
                <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
                  数据已生成到预览目录，尚未写入 SQLite。确认后会刷新演示库。
                </p>
                <p className="mt-1 font-data-mono text-data-mono text-on-surface-variant">
                  批次 {pendingGeneration.preview_id ?? '--'}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant bg-surface text-on-surface hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleDiscardGeneratedDemo}
                disabled={persistingGeneratedDemo}
                aria-label="关闭生成预览"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="max-h-[calc(86vh-148px)] overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {Object.entries(pendingGeneration.generated_files).map(([key, value]) => (
                  <div key={key} className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-3">
                    <div className="font-label-caps text-[10px] uppercase text-on-surface-variant">{formatGeneratedFileLabel(key)}</div>
                    <div className="mt-1 font-data-mono text-[20px] font-bold leading-7 text-on-surface">{formatCount(value)}</div>
                  </div>
                ))}
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4">
                  <h3 className="font-title-sm text-title-sm text-on-surface">生成参数</h3>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 font-body-sm text-body-sm">
                    <dt className="text-on-surface-variant">基站数量</dt>
                    <dd className="font-data-mono text-on-surface">{pendingGeneration.parameters.station_count}</dd>
                    <dt className="text-on-surface-variant">指标数量</dt>
                    <dd className="font-data-mono text-on-surface">{pendingGeneration.parameters.metric_count}</dd>
                    <dt className="text-on-surface-variant">故障比例</dt>
                    <dd className="font-data-mono text-on-surface">{pendingGeneration.parameters.fault_ratio}</dd>
                    <dt className="text-on-surface-variant">随机种子</dt>
                    <dd className="font-data-mono text-on-surface">{pendingGeneration.parameters.seed}</dd>
                  </dl>
                </div>

                <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4">
                  <h3 className="font-title-sm text-title-sm text-on-surface">故障类型分布</h3>
                  <div className="mt-3 flex flex-col gap-2">
                    {Object.entries(pendingGeneration.fault_type_counts).map(([type, count]) => (
                      <div key={type} className="flex items-center justify-between gap-3">
                        <span className="truncate font-body-sm text-body-sm text-on-surface">{type}</span>
                        <span className="font-data-mono text-data-mono text-on-surface-variant">{formatCount(count)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-outline-variant bg-surface px-5 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-outline-variant bg-surface px-4 py-2 text-body-sm font-body-sm text-on-surface hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleDiscardGeneratedDemo}
                disabled={persistingGeneratedDemo}
              >
                取消写入
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-body-sm font-body-sm text-on-primary hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                onClick={handlePersistGeneratedDemo}
                disabled={persistingGeneratedDemo}
              >
                <span aria-hidden="true" className={`material-symbols-outlined text-[18px] ${persistingGeneratedDemo ? 'animate-spin-slow' : ''}`}>
                  {persistingGeneratedDemo ? 'progress_activity' : 'database'}
                </span>
                {persistingGeneratedDemo ? '写入中' : '写入 SQLite 并刷新总览'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isEmptyDatabase ? (
        <EmptyState
          icon="database"
          title="当前系统处于空白演示状态"
          description="SQLite 中暂未写入基站、网络指标和故障日志。请先进入系统设置生成或导入数据，再执行检测、分类、定位和诊断演示。"
          actionLabel="前往系统设置"
          actionTo="/settings"
          secondaryActionLabel="在地图上框选生成"
          secondaryActionTo="/map"
        >
          <div className="grid gap-2 text-left font-body-sm text-body-sm text-on-surface-variant sm:grid-cols-3">
            <div className="rounded-lg border border-outline-variant bg-surface px-3 py-2">
              1. 生成或导入网络数据
            </div>
            <div className="rounded-lg border border-outline-variant bg-surface px-3 py-2">
              2. 写入 SQLite 演示库
            </div>
            <div className="rounded-lg border border-outline-variant bg-surface px-3 py-2">
              3. 查看故障和诊断结果
            </div>
          </div>
        </EmptyState>
      ) : null}

      {!isEmptyDatabase ? (
        <>
          {/* ── Row 1: Metric Cards ─────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter">
            <MetricCard
              label="在线基站数"
              value={stationValue}
              icon="wifi"
              iconColor="text-emerald-600"
              trend={{ direction: 'up', value: '2%', color: 'text-emerald-600' }}
            />
            <MetricCard
              label="当前告警数"
              value={faultValue}
              icon="warning"
              iconColor="text-amber-500"
              trend={{ direction: 'down', value: '5%', color: 'text-emerald-600' }}
            />
            <MetricCard
              label="严重故障数"
              value={severeValue}
              icon="error"
              iconColor="text-error"
              errorVariant
            />
            <MetricCard
              label="检测准确率"
              value={summary?.classification_accuracy == null ? '--' : accuracyValue}
              icon="troubleshoot"
              iconColor="text-cyan-600"
            />
          </div>

          {/* ── Row 2: Charts ───────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
            {/* Left Chart – Trend */}
            <ChartPanel title="故障数量趋势" className="lg:col-span-2 !h-[360px]">
              <div ref={trendRef} className="w-full h-full" />
            </ChartPanel>

            {/* Right Chart – Donut */}
            <ChartPanel title="故障类型分布" className="lg:col-span-1 !h-[360px]">
              <div ref={pieRef} className="w-full h-full" />
            </ChartPanel>
          </div>

          {/* ── Row 3: Alert Table ───────────────────────────────── */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-lg shadow-sm overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-card-padding border-b border-outline-variant flex justify-between items-center bg-surface-bright">
          <h2 className="font-headline-md text-headline-md text-on-surface">实时告警列表</h2>
          <Link
            to="/faults"
            className="text-primary font-label-caps text-label-caps hover:text-primary-fixed-dim flex items-center gap-1 transition-colors"
          >
            查看全部
            <span aria-hidden="true" className="material-symbols-outlined text-sm">arrow_forward</span>
          </Link>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant">
                <th className="py-3 px-4 font-label-caps text-label-caps text-secondary uppercase whitespace-nowrap">故障时间</th>
                <th className="py-3 px-4 font-label-caps text-label-caps text-secondary uppercase whitespace-nowrap">基站名</th>
                <th className="py-3 px-4 font-label-caps text-label-caps text-secondary uppercase whitespace-nowrap">故障类型</th>
                <th className="py-3 px-4 font-label-caps text-label-caps text-secondary uppercase whitespace-nowrap">严重程度</th>
                <th className="py-3 px-4 font-label-caps text-label-caps text-secondary uppercase w-full">简要描述</th>
              </tr>
            </thead>
            <tbody className="font-data-mono text-data-mono divide-y divide-outline-variant/50">
              {faults.slice(0, 5).map((fault, idx) => (
                <tr
                  key={fault.fault_id}
                  className={[
                    'hover:bg-surface-container-lowest transition-colors group cursor-pointer',
                    idx === 0 ? 'slide-in-right highlight-fade' : '',
                  ].join(' ')}
                >
                  <td className="py-3 px-4 text-on-surface-variant">{formatTime(fault.detected_at)}</td>
                  <td className="py-3 px-4 font-semibold text-primary">{fault.station_id || 'UNKNOWN'}</td>
                  <td className="py-3 px-4">{fault.fault_type_cn || '--'}</td>
                  <td className="py-3 px-4">
                    <StatusBadge status={severityBadgeStatus(fault.fault_level)} size="sm" />
                  </td>
                  <td className="py-3 px-4 text-on-surface-variant truncate max-w-xs" title={describeFault(fault)}>
                    {describeFault(fault)}
                  </td>
                </tr>
              ))}
              {faults.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8">
                    <EmptyState
                      icon="notifications_off"
                      title="暂无实时告警"
                      description="当前演示库还没有故障日志。导入或生成数据后，这里会显示最新故障记录。"
                      actionLabel="导入或生成数据"
                      actionTo="/settings"
                      className="border-0 bg-transparent py-4"
                    />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
