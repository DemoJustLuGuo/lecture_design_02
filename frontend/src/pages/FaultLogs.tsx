import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { StatusBadge } from '@/components/StatusBadge'
import { fetchFaults } from '@/api/faults'
import type { FaultLog } from '@/types/api'
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
  const ss = String(parsed.getSeconds()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`
}

function severityBadgeStatus(level: string | null): 'critical' | 'warning' | 'info' | 'normal' | 'offline' {
  if (level === FaultLevel.Critical || level === '严重') return 'critical'
  if (level === FaultLevel.Warning || level === '预警' || level === '警告') return 'warning'
  if (level === FaultLevel.Info || level === '一般' || level === '提示') return 'info'
  return 'info'
}

function statusBadgeStatus(status: string | null): 'critical' | 'warning' | 'info' | 'normal' | 'offline' {
  if (status === 'open' || status === 'Open') return 'critical'
  if (status === 'investigating' || status === 'Investigating') return 'warning'
  if (status === 'resolved' || status === 'Resolved') return 'info'
  if (status === 'closed' || status === 'Closed') return 'normal'
  return 'info'
}

function faultTypeIcon(type: string | null): string {
  if (!type) return 'help'
  if (type.includes('硬件') || type.includes('Hardware')) return 'memory'
  if (type.includes('网络') || type.includes('Network')) return 'cell_tower'
  if (type.includes('电源') || type.includes('Power')) return 'power'
  if (type.includes('环境') || type.includes('Environment')) return 'thermostat'
  if (type.includes('信号') || type.includes('Signal') || type.includes('中断')) return 'wifi_off'
  if (type.includes('误码') || type.includes('BER')) return 'error'
  if (type.includes('带宽') || type.includes('Bandwidth')) return 'speed'
  if (type.includes('信道') || type.includes('干扰') || type.includes('Interference')) return 'sensors'
  if (type.includes('基站') || type.includes('Station')) return 'router'
  return 'help'
}

/* ── Filter State ────────────────────────────────────────────── */

type FaultTypeFilter = 'all' | 'hardware' | 'software' | 'network' | 'power' | 'env'
type SeverityFilter = 'all' | 'critical' | 'warning' | 'info'
type StatusFilter = 'all' | 'active' | 'resolved'

/* ── Fault Logs Page ─────────────────────────────────────────── */

export default function FaultLogs() {
  const navigate = useNavigate()
  const [faults, setFaults] = useState<FaultLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [typeFilter, setTypeFilter] = useState<FaultTypeFilter>('all')
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetchFaults(200)
      .then((data) => setFaults(data))
      .catch((err) => setError(err.message || '数据加载失败'))
      .finally(() => setLoading(false))
  }, [])

  /* ── Client-side filtering ────────────────────────────── */
  const filteredFaults = useMemo(() => {
    return faults.filter((fault) => {
      // Type filter
      if (typeFilter !== 'all') {
        const typeMap: Record<string, string[]> = {
          hardware: ['硬件故障', 'Hardware', '基站故障', 'Station Fault', 'station_fault'],
          software: ['软件异常', 'Software'],
          network: ['网络中断', 'Network', '信号中断', 'Signal Interrupt', 'signal_interrupt', '信道干扰', 'Channel Interference', 'channel_interference'],
          power: ['电源告警', 'Power'],
          env: ['环境异常', 'Environment'],
        }
        const keywords = typeMap[typeFilter] ?? []
        const match = keywords.some((kw) =>
          (fault.fault_type_cn?.includes(kw)) || (fault.fault_type_raw?.includes(kw))
        )
        if (!match) return false
      }

      // Severity filter
      if (severityFilter !== 'all') {
        const levelMap: Record<string, string[]> = {
          critical: [FaultLevel.Critical, '严重'],
          warning: [FaultLevel.Warning, '预警', '警告'],
          info: [FaultLevel.Info, '一般', '提示'],
        }
        const levels = levelMap[severityFilter] ?? []
        if (!levels.includes(fault.fault_level ?? '')) return false
      }

      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'active' && (fault.status === 'resolved' || fault.status === 'closed')) return false
        if (statusFilter === 'resolved' && fault.status !== 'resolved') return false
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        const matchesId = fault.station_id?.toLowerCase().includes(q)
        const matchesFaultId = fault.fault_id?.toLowerCase().includes(q)
        const matchesType = fault.fault_type_cn?.toLowerCase().includes(q)
        if (!matchesId && !matchesFaultId && !matchesType) return false
      }

      return true
    })
  }, [faults, typeFilter, severityFilter, statusFilter, searchQuery])

  /* ── Loading / Error states ────────────────────────────── */
  if (loading && faults.length === 0) {
    return (
      <div className="max-w-[1200px] mx-auto flex flex-col gap-gutter animate-fade-in">
        <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-card-padding text-body-sm text-on-surface-variant">
          正在加载故障日志...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-[1200px] mx-auto flex flex-col gap-gutter animate-fade-in">
        <div className="bg-error-container border border-error/30 rounded-lg p-card-padding text-on-error-container">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-gutter animate-fade-in">

      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="font-headline-md text-headline-md text-on-surface">故障日志 (Fault Logs)</h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
            Browse and search network fault records.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="flex items-center gap-2 px-4 py-2 bg-surface border border-outline-variant rounded-lg text-body-sm font-body-sm text-on-surface hover:bg-surface-container-low transition-colors shadow-sm"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            导出 CSV
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg text-body-sm font-body-sm hover:bg-primary/90 transition-colors shadow-sm"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            新建记录
          </button>
        </div>
      </div>

      {/* ── Filter Bar ───────────────────────────────────────── */}
      <div className="bg-surface border border-outline-variant rounded-xl p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Fault type dropdown */}
          <div className="flex flex-col gap-1.5">
            <label className="font-label-caps text-label-caps text-secondary uppercase">故障类型</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as FaultTypeFilter)}
              className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-body-sm font-body-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            >
              <option value="all">所有类型 (All)</option>
              <option value="hardware">硬件故障 (Hardware)</option>
              <option value="software">软件异常 (Software)</option>
              <option value="network">网络中断 (Network)</option>
              <option value="power">电源告警 (Power)</option>
              <option value="env">环境异常 (Environment)</option>
            </select>
          </div>

          {/* Severity dropdown */}
          <div className="flex flex-col gap-1.5">
            <label className="font-label-caps text-label-caps text-secondary uppercase">严重程度</label>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}
              className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-body-sm font-body-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            >
              <option value="all">所有级别 (All)</option>
              <option value="critical">严重 (Critical)</option>
              <option value="warning">警告 (Warning)</option>
              <option value="info">提示 (Info)</option>
            </select>
          </div>

          {/* Status dropdown */}
          <div className="flex flex-col gap-1.5">
            <label className="font-label-caps text-label-caps text-secondary uppercase">处理状态</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-body-sm font-body-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            >
              <option value="all">所有状态 (All)</option>
              <option value="active">待处理 (Active)</option>
              <option value="resolved">已解决 (Resolved)</option>
            </select>
          </div>

          {/* Search input */}
          <div className="flex flex-col gap-1.5">
            <label className="font-label-caps text-label-caps text-secondary uppercase">搜索</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">search</span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-surface-container-low border border-outline-variant rounded-lg text-body-sm font-body-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                placeholder="Search by station ID or fault code..."
                type="text"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Data Table ───────────────────────────────────────── */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low">
                <th className="py-3 px-4 font-label-caps text-label-caps text-secondary uppercase tracking-wider w-24">故障编号</th>
                <th className="py-3 px-4 font-label-caps text-label-caps text-secondary uppercase tracking-wider">
                  <div className="flex items-center gap-1">
                    检测时间
                    <span className="material-symbols-outlined text-[16px] text-outline">arrow_downward</span>
                  </div>
                </th>
                <th className="py-3 px-4 font-label-caps text-label-caps text-secondary uppercase tracking-wider">基站编号</th>
                <th className="py-3 px-4 font-label-caps text-label-caps text-secondary uppercase tracking-wider">故障类型</th>
                <th className="py-3 px-4 font-label-caps text-label-caps text-secondary uppercase tracking-wider">
                  <div className="flex items-center gap-1">
                    严重程度
                    <span className="material-symbols-outlined text-[16px] text-outline">unfold_more</span>
                  </div>
                </th>
                <th className="py-3 px-4 font-label-caps text-label-caps text-secondary uppercase tracking-wider">置信度</th>
                <th className="py-3 px-4 font-label-caps text-label-caps text-secondary uppercase tracking-wider">处理状态</th>
                <th className="py-3 px-4 font-label-caps text-label-caps text-secondary uppercase tracking-wider text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {filteredFaults.map((fault) => (
                <tr
                  key={fault.fault_id}
                  className="hover:bg-surface-container-lowest transition-colors group cursor-pointer"
                  onClick={() => navigate(`/faults/${fault.fault_id}/diagnosis`)}
                >
                  <td className="py-3 px-4 font-data-mono text-data-mono text-on-surface">{fault.fault_id}</td>
                  <td className="py-3 px-4 font-data-mono text-data-mono text-on-surface-variant">{formatTime(fault.detected_at)}</td>
                  <td className="py-3 px-4 font-data-mono text-data-mono text-on-surface">{fault.station_id || '--'}</td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-error-container/50 text-on-error-container text-[11px] font-semibold border border-error/20">
                      <span className="material-symbols-outlined text-[14px]">{faultTypeIcon(fault.fault_type_cn)}</span>
                      {fault.fault_type_cn || '--'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={severityBadgeStatus(fault.fault_level)} size="sm" />
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
                        <div
                          className="h-full bg-error rounded-full"
                          style={{ width: `${Math.round((fault.confidence ?? 0) * 100)}%` }}
                        />
                      </div>
                      <span className="font-data-mono text-data-mono text-on-surface-variant">
                        {fault.confidence != null ? `${Math.round(fault.confidence * 100)}%` : '--'}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={statusBadgeStatus(fault.status)} size="sm" />
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button className="p-1 text-outline hover:text-primary transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100" type="button">
                      <span className="material-symbols-outlined text-[20px]">more_vert</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <div className="border-t border-outline-variant bg-surface px-4 py-3 flex items-center justify-between">
          <span className="font-body-sm text-body-sm text-on-surface-variant">
            Showing {filteredFaults.length > 0 ? 1 : 0} to {Math.min(filteredFaults.length, 10)} of {filteredFaults.length} entries
          </span>
          <div className="flex items-center gap-2">
            <button
              className="w-8 h-8 flex items-center justify-center rounded border border-outline-variant text-outline hover:bg-surface-container-low transition-colors disabled:opacity-50"
              type="button"
              disabled
            >
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
            </button>
            <button
              className="w-8 h-8 flex items-center justify-center rounded bg-primary text-on-primary text-body-sm font-medium"
              type="button"
            >
              1
            </button>
            <button
              className="w-8 h-8 flex items-center justify-center rounded border border-outline-variant text-on-surface hover:bg-surface-container-low transition-colors text-body-sm font-medium"
              type="button"
            >
              2
            </button>
            <button
              className="w-8 h-8 flex items-center justify-center rounded border border-outline-variant text-on-surface hover:bg-surface-container-low transition-colors text-body-sm font-medium"
              type="button"
            >
              3
            </button>
            <span className="text-outline">...</span>
            <button
              className="w-8 h-8 flex items-center justify-center rounded border border-outline-variant text-outline hover:bg-surface-container-low transition-colors"
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
