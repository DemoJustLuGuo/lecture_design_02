import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { MetricCard } from '@/components/MetricCard'
import { ChartPanel } from '@/components/ChartPanel'
import { StatusBadge } from '@/components/StatusBadge'
import { fetchDashboardSummary } from '@/api/dashboard'
import { fetchFaults } from '@/api/faults'
import { useCountUp } from '@/hooks/useCountUp'
import { useECharts } from '@/hooks/useECharts'
import { COLORS, mergeOption } from '@/theme'
import type { DashboardSummary, FaultLog } from '@/types/api'
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

/* ── Dashboard Page ──────────────────────────────────────────── */

export default function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [faults, setFaults] = useState<FaultLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([fetchDashboardSummary(), fetchFaults(5)])
      .then(([summaryData, faultsData]) => {
        setSummary(summaryData)
        setFaults(faultsData)
      })
      .catch((err) => setError(err.message || '数据加载失败'))
      .finally(() => setLoading(false))
  }, [])

  /* ── Count-up animated values ──────────────────────────── */
  const stationValue = useCountUp(summary?.station_count ?? 0, 1000)
  const faultValue = useCountUp(summary?.fault_count ?? 0, 1000)
  const severeValue = useCountUp(summary?.severe_fault_count ?? 0, 1000)
  const accuracyValue = useCountUp((summary?.classification_accuracy ?? 0) * 100, 1000, '%')

  /* ── ECharts: Trend line ──────────────────────────────── */
  const trendRef = useRef<HTMLDivElement>(null)

  const trendData = useMemo(() => {
    const base = summary?.fault_count ?? 24
    const severe = summary?.severe_fault_count ?? 3
    return [
      { label: '6-9',  total: Math.round(base * 0.62), severe: Math.round(severe * 0.5) },
      { label: '6-10', total: Math.round(base * 0.72), severe: Math.round(severe * 0.7) },
      { label: '6-11', total: Math.round(base * 0.53), severe: Math.round(severe * 0.35) },
      { label: '6-12', total: Math.round(base * 0.9),  severe: severe },
      { label: '6-13', total: Math.round(base * 0.56), severe: Math.round(severe * 0.45) },
      { label: '6-14', total: Math.round(base * 0.76), severe: Math.round(severe * 0.6) },
      { label: '6-15', total: Math.max(1, Math.round(base * 0.33)), severe: Math.max(0, Math.round(severe * 0.25)) },
    ]
  }, [summary])

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
          value={accuracyValue}
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
            <span className="material-symbols-outlined text-sm">arrow_forward</span>
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
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
