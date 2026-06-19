import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useECharts } from '@/hooks/useECharts'
import { fetchStationDetail } from '@/api/stations'
import { COLORS, FONT, mergeOption } from '@/theme'
import { StatusBadge } from '@/components/StatusBadge'
import { EmptyState } from '@/components/EmptyState'
import type { StationDetail } from '@/types/api'

/* ── Status text to StatusBadge type mapping ──────────── */
function severityToStatus(level: string | null): 'critical' | 'warning' | 'info' | 'normal' | 'offline' {
  if (!level) return 'info'
  const l = level.toLowerCase()
  if (l.includes('critical') || l.includes('严重') || l.includes('一级')) return 'critical'
  if (l.includes('warning') || l.includes('预警') || l.includes('二级')) return 'warning'
  if (l.includes('info') || l.includes('提示') || l.includes('三级')) return 'info'
  if (l.includes('resolved') || l.includes('completed') || l.includes('已解决') || l.includes('正常')) return 'normal'
  return 'offline'
}

function statusText(status?: string | null): string {
  if (!status) return '未知'
  const normalized = status.toLowerCase()
  if (normalized.includes('active') || normalized.includes('normal') || status.includes('正常')) return '正常'
  if (normalized.includes('warning') || status.includes('预警')) return '预警'
  if (normalized.includes('critical') || normalized.includes('severe') || status.includes('严重')) return '严重'
  if (normalized.includes('offline') || status.includes('离线')) return '离线'
  if (normalized.includes('resolved') || normalized.includes('completed') || status.includes('已处理')) return '已处理'
  if (normalized.includes('processing') || status.includes('处理中')) return '处理中'
  if (normalized.includes('pending') || normalized.includes('open') || status.includes('待处理')) return '待处理'
  return status
}

/* ── Main Page ──────────────────────────────────────────── */

export default function StationDetailPage() {
  const { id: stationId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const chartRef = useRef<HTMLDivElement>(null)

  const [station, setStation] = useState<StationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!stationId) return
    setLoading(true)
    setError(null)
    fetchStationDetail(stationId)
      .then((stationData) => {
        setStation(stationData)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [stationId])

  /* ── ECharts option factory ─────────────────────────── */
  const optionFactory = useCallback(() => {
    if (!station?.recent_metrics?.length) {
      return mergeOption({
        xAxis: { type: 'category', data: [] },
        yAxis: [{ type: 'value' }, { type: 'value', position: 'right' }],
        series: [],
      })
    }

    const metrics = station.recent_metrics
    const timestamps = metrics.map((m) => {
      if (!m.timestamp) return ''
      /* Format timestamp to short time */
      const d = new Date(m.timestamp)
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
    })

    return mergeOption({
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'line',
          lineStyle: { color: COLORS.outlineVariant, width: 1, type: 'dashed' },
        },
      },
      legend: {
        data: ['RSRP', 'SINR', 'BER', 'PRB利用率'],
        textStyle: { color: COLORS.onSurfaceVariant, fontFamily: FONT.sans },
        icon: 'circle',
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true,
        show: false,
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: timestamps,
        axisLine: { lineStyle: { color: '#e2e8f0' } },
        axisLabel: { color: COLORS.onSurfaceVariant, fontFamily: FONT.mono },
        splitLine: { show: false },
      },
      yAxis: [
        {
          type: 'value',
          name: 'RSRP/SINR',
          nameTextStyle: { color: COLORS.onSurfaceVariant },
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { color: COLORS.onSurfaceVariant, fontFamily: FONT.mono },
          splitLine: { lineStyle: { color: '#f1f5f9' } },
        },
        {
          type: 'value',
          name: 'PRB (%)',
          nameTextStyle: { color: COLORS.onSurfaceVariant },
          position: 'right',
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { color: COLORS.onSurfaceVariant, fontFamily: FONT.mono },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: 'RSRP',
          type: 'line',
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 2, color: COLORS.chartPalette[0] },
          areaStyle: { opacity: 0.12, color: COLORS.chartPalette[0] },
          data: metrics.map((m) => m.rsrp ?? null),
        },
        {
          name: 'SINR',
          type: 'line',
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 2, color: COLORS.chartPalette[1] },
          areaStyle: { opacity: 0.12, color: COLORS.chartPalette[1] },
          data: metrics.map((m) => m.sinr ?? null),
        },
        {
          name: 'BER',
          type: 'line',
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 2, color: COLORS.chartPalette[4] },
          areaStyle: { opacity: 0.12, color: COLORS.chartPalette[4] },
          data: metrics.map((m) => m.ber ?? null),
        },
        {
          name: 'PRB利用率',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 2, type: 'dashed', color: COLORS.chartPalette[6] },
          areaStyle: { opacity: 0.08, color: COLORS.chartPalette[6] },
          data: metrics.map((m) => m.bandwidth_usage ?? null),
        },
      ],
    })
  }, [station])

  useECharts(chartRef, optionFactory)

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-gutter animate-fade-in">
        <div className="flex items-center justify-center h-[400px] text-on-surface-variant font-body-md">
          <span aria-hidden="true" className="material-symbols-outlined animate-pulse-scale mr-2">progress_activity</span>
          加载基站数据...
        </div>
      </div>
    )
  }

  if (error || !station) {
    return (
      <div className="max-w-7xl mx-auto space-y-gutter animate-fade-in">
        <EmptyState
          icon="cell_tower"
          title="未找到基站数据"
          description={error ?? '当前演示库中没有对应基站记录。请先导入或生成基站工参和网络指标数据。'}
          actionLabel="前往基站管理"
          actionTo="/stations"
          secondaryActionLabel="前往系统设置"
          secondaryActionTo="/settings"
        />
      </div>
    )
  }

  const isStationActive = station.status?.toLowerCase() === 'online' || station.status?.toLowerCase() === 'active'
  const statusColor = isStationActive ? 'text-[#10B981]' : 'text-on-surface-variant'
  const faults = station.recent_faults ?? []

  return (
    <div className="max-w-7xl mx-auto space-y-gutter animate-fade-in">
      {/* ── Top Card: Station Info ────────────────────────── */}
      <div className="bg-surface border border-outline-variant rounded-xl p-card-padding">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 border-b border-outline-variant pb-4">
          <div>
            <h2 className="font-headline-md text-headline-md text-on-surface">基站详情</h2>
            <p className="font-body-sm text-body-sm text-secondary mt-1">基站工参、位置与状态概览</p>
          </div>
          <div className="flex items-center gap-2 bg-surface-container-low px-3 py-1.5 rounded-full border border-outline-variant">
            <div className={`w-2.5 h-2.5 rounded-full ${isStationActive ? 'bg-[#10B981]' : 'bg-on-surface-variant'}`} />
            <span className="font-label-caps text-label-caps text-on-surface">{statusText(station.status)}</span>
          </div>
        </div>

        {/* 4-column grid (2 cols mobile, 4 cols desktop) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <span className="font-label-caps text-label-caps text-secondary block mb-1 uppercase">基站编号</span>
            <span className="font-data-mono text-data-mono text-on-surface">{station.station_id}</span>
          </div>
          <div>
            <span className="font-label-caps text-label-caps text-secondary block mb-1 uppercase">gNodeB ID</span>
            <span className="font-data-mono text-data-mono text-on-surface">{station.gnodeb_id ?? '-'}</span>
          </div>
          <div>
            <span className="font-label-caps text-label-caps text-secondary block mb-1 uppercase">PCI</span>
            <span className="font-data-mono text-data-mono text-on-surface">{station.pci ?? '-'}</span>
          </div>
          <div>
            <span className="font-label-caps text-label-caps text-secondary block mb-1 uppercase">状态</span>
            <span className={`font-data-mono text-data-mono ${statusColor}`}>{statusText(station.status)}</span>
          </div>
          <div>
            <span className="font-label-caps text-label-caps text-secondary block mb-1 uppercase">经纬度</span>
            <span className="font-data-mono text-data-mono text-on-surface">
              {station.longitude ?? '-'} / {station.latitude ?? '-'}
            </span>
          </div>
          <div>
            <span className="font-label-caps text-label-caps text-secondary block mb-1 uppercase">方位角</span>
            <span className="font-data-mono text-data-mono text-on-surface">{station.azimuth != null ? `${station.azimuth}°` : '-'}</span>
          </div>
          <div>
            <span className="font-label-caps text-label-caps text-secondary block mb-1 uppercase">天线高度</span>
            <span className="font-data-mono text-data-mono text-on-surface">{station.height != null ? `${station.height}m` : '-'}</span>
          </div>
          <div>
            <span className="font-label-caps text-label-caps text-secondary block mb-1 uppercase">发射功率</span>
            <span className="font-data-mono text-data-mono text-on-surface">{station.tx_power != null ? `${station.tx_power} dBm` : '-'}</span>
          </div>
        </div>
      </div>

      {/* ── Middle: Metrics Trend Chart ───────────────────── */}
      <div className="bg-surface border border-outline-variant rounded-xl p-card-padding">
        <h2 className="font-headline-md text-headline-md text-on-surface mb-6">基站运行指标趋势</h2>
        <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
          最近 {station.recent_metrics?.length ?? 0} 条采样，RSRP 单位 dBm，SINR 单位 dB，PRB 利用率单位 %。
        </p>
        {station.recent_metrics?.length ? (
          <div ref={chartRef} style={{ height: 350, width: '100%', position: 'relative' }} />
        ) : (
          <EmptyState
            icon="monitoring"
            title="暂无运行指标采样"
            description="该基站当前没有关联网络指标。导入指标数据后可查看 RSRP、SINR、BER 和 PRB 利用率趋势。"
            actionLabel="导入数据"
            actionTo="/settings"
            className="py-8"
          />
        )}
      </div>

      {/* ── Bottom: Fault Records Table ───────────────────── */}
      <div className="bg-surface border border-outline-variant rounded-xl overflow-hidden">
        <div className="p-card-padding border-b border-outline-variant">
          <h2 className="font-headline-md text-headline-md text-on-surface">该基站近期故障记录</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant">
                <th className="py-3 px-4 font-label-caps text-label-caps text-secondary uppercase tracking-wider">时间</th>
                <th className="py-3 px-4 font-label-caps text-label-caps text-secondary uppercase tracking-wider">严重程度</th>
                <th className="py-3 px-4 font-label-caps text-label-caps text-secondary uppercase tracking-wider">故障编号</th>
                <th className="py-3 px-4 font-label-caps text-label-caps text-secondary uppercase tracking-wider">故障描述</th>
                <th className="py-3 px-4 font-label-caps text-label-caps text-secondary uppercase tracking-wider">处理状态</th>
                <th className="py-3 px-4 font-label-caps text-label-caps text-secondary uppercase tracking-wider text-right">操作</th>
              </tr>
            </thead>
            <tbody className="font-body-sm text-body-sm text-on-surface">
              {faults.length > 0 ? (
                faults.map((fault) => (
                  <tr key={fault.fault_id} className="border-b border-outline-variant hover:bg-surface-container-low transition-colors">
                    <td className="py-3 px-4 font-data-mono text-data-mono">{fault.detected_at ?? '-'}</td>
                    <td className="py-3 px-4">
                      <StatusBadge status={severityToStatus(fault.fault_level)} size="sm" />
                    </td>
                    <td className="py-3 px-4 font-data-mono text-data-mono">{fault.fault_id}</td>
                    <td className="py-3 px-4">{fault.fault_type_cn ?? fault.fault_type_raw ?? '-'}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-surface-variant text-secondary">
                        {statusText(fault.status)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => navigate(`/faults/${fault.fault_id}/diagnosis`)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline-variant text-primary hover:bg-primary-container transition-colors font-body-sm text-body-sm"
                      >
                        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">troubleshoot</span>
                        查看诊断
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-6 px-4 text-center text-on-surface-variant">该基站暂无故障记录</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
