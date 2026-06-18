import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { StatusBadge } from '@/components/StatusBadge'
import { EmptyState } from '@/components/EmptyState'
import { classifyFaults, fetchFaults, updateFaultStatus } from '@/api/faults'
import type { FaultLog, FaultProcessStatus } from '@/types/api'
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
  if (status === '处理中') return 'info'
  if (status === '已处理' || status === 'resolved' || status === 'Resolved') return 'normal'
  if (status === '关闭' || status === 'closed' || status === 'Closed') return 'offline'
  if (status === '未处理') return 'warning'
  return 'info'
}

function nextStatusActions(status: string | null): Array<{ status: FaultProcessStatus; label: string; icon: string }> {
  if (!status || status === '未处理') {
    return [{ status: '处理中', label: '开始处理', icon: 'play_circle' }]
  }
  if (status === '处理中') {
    return [
      { status: '已处理', label: '已处理', icon: 'task_alt' },
      { status: '关闭', label: '关闭', icon: 'cancel' },
    ]
  }
  return []
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

function isAiFault(fault: FaultLog): boolean {
  return fault.fault_id.startsWith('AI_')
}

function escapeCsvCell(value: unknown): string {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function buildFaultCsv(faults: FaultLog[]): string {
  const headers = ['故障编号', '来源', '检测时间', '基站编号', '故障类型', '严重程度', '置信度', '处理状态']
  const rows = faults.map((fault) => [
    fault.fault_id,
    isAiFault(fault) ? 'AI识别' : '历史样本',
    fault.detected_at ?? '',
    fault.station_id ?? '',
    fault.fault_type_cn ?? '',
    fault.fault_level ?? '',
    fault.confidence == null ? '' : `${Math.round(fault.confidence * 100)}%`,
    fault.status ?? '',
  ])
  return [headers, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')
}

/* ── Filter State ────────────────────────────────────────────── */

type FaultTypeFilter = 'all' | '信道干扰' | '基站故障' | '带宽不足' | '误码过高' | '信号中断/覆盖退化' | '未分类异常'
type SeverityFilter = 'all' | 'critical' | 'warning' | 'info'
type StatusFilter = 'all' | '未处理' | '处理中' | '已处理' | '关闭'
type SourceFilter = 'all' | 'ai' | 'history'

type ActionMessage = {
  tone: 'success' | 'error'
  text: string
}

const PAGE_SIZE = 20

/* ── Fault Logs Page ─────────────────────────────────────────── */

export default function FaultLogs() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [faults, setFaults] = useState<FaultLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [classifying, setClassifying] = useState(false)
  const [updatingFaultId, setUpdatingFaultId] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<ActionMessage | null>(null)

  const [typeFilter, setTypeFilter] = useState<FaultTypeFilter>('all')
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('search') ?? '')
  const [page, setPage] = useState(1)

  const loadFaults = useCallback(async () => {
    const data = await fetchFaults(200, 0, {
      fault_type: typeFilter === 'all' ? undefined : typeFilter,
      fault_level: severityFilter === 'all'
        ? undefined
        : severityFilter === 'critical'
          ? '严重'
          : severityFilter === 'warning'
            ? '预警'
            : '一般',
      status: statusFilter === 'all' ? undefined : statusFilter,
      source: sourceFilter === 'all' ? undefined : sourceFilter,
    })
    setFaults(data)
  }, [severityFilter, sourceFilter, statusFilter, typeFilter])

  useEffect(() => {
    loadFaults()
      .catch((err) => setError(err.message || '数据加载失败'))
      .finally(() => setLoading(false))
  }, [loadFaults])

  useEffect(() => {
    setSearchQuery(searchParams.get('search') ?? '')
  }, [searchParams])

  const handleRunAiClassification = useCallback(async () => {
    setClassifying(true)
    setActionMessage(null)
    setError(null)
    try {
      const result = await classifyFaults({ limit: 20, persist: true })
      await loadFaults()
      const persistence = result.persistence
      const persisted = persistence?.persisted_count ?? 0
      const skipped = persistence?.skipped_count ?? 0
      const sampleCount = result.sample_count ?? 0
      setActionMessage({
        tone: 'success',
        text: `AI 分类完成：处理 ${sampleCount} 条样本，写入/更新 ${persisted} 条故障日志，跳过 ${skipped} 条正常或重复记录。`,
      })
    } catch (err) {
      setActionMessage({
        tone: 'error',
        text: err instanceof Error ? err.message : 'AI 分类入库失败',
      })
    } finally {
      setClassifying(false)
    }
  }, [loadFaults])

  /* ── Client-side filtering ────────────────────────────── */
  const filteredFaults = useMemo(() => {
    return faults.filter((fault) => {
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
  }, [faults, searchQuery])

  const totalPages = Math.max(1, Math.ceil(filteredFaults.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageStart = filteredFaults.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const pageEnd = Math.min(currentPage * PAGE_SIZE, filteredFaults.length)
  const pagedFaults = filteredFaults.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const isEmptyDatabase = faults.length === 0
    && !searchQuery.trim()
    && typeFilter === 'all'
    && severityFilter === 'all'
    && statusFilter === 'all'
    && sourceFilter === 'all'

  useEffect(() => {
    setPage(1)
  }, [searchQuery, typeFilter, severityFilter, statusFilter, sourceFilter])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const handleExportCsv = useCallback(() => {
    if (filteredFaults.length === 0) {
      setActionMessage({ tone: 'error', text: '当前筛选条件下没有可导出的故障记录。' })
      return
    }
    const blob = new Blob([`\ufeff${buildFaultCsv(filteredFaults)}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `fault_logs_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    setActionMessage({ tone: 'success', text: `已导出 ${filteredFaults.length} 条当前筛选结果。` })
  }, [filteredFaults])

  const handleUpdateStatus = useCallback(async (
    event: React.MouseEvent<HTMLButtonElement>,
    fault: FaultLog,
    status: FaultProcessStatus,
  ) => {
    event.stopPropagation()
    setUpdatingFaultId(fault.fault_id)
    setActionMessage(null)
    try {
      const updated = await updateFaultStatus(fault.fault_id, status)
      await loadFaults()
      setActionMessage({
        tone: 'success',
        text: `故障 ${updated.fault_id} 状态已更新为 ${updated.status || status}。`,
      })
    } catch (err) {
      setActionMessage({
        tone: 'error',
        text: err instanceof Error ? err.message : '故障状态更新失败',
      })
    } finally {
      setUpdatingFaultId(null)
    }
  }, [loadFaults])

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
          <Link
            className="flex items-center gap-2 px-4 py-2 bg-primary-container text-primary border border-primary/20 rounded-lg text-body-sm font-body-sm hover:bg-primary-container/80 transition-colors shadow-sm"
            to="/settings"
          >
            <span className="material-symbols-outlined text-[18px]">database</span>
            导入数据
          </Link>
          <button
            className="flex items-center gap-2 px-4 py-2 bg-surface border border-outline-variant rounded-lg text-body-sm font-body-sm text-on-surface hover:bg-surface-container-low transition-colors shadow-sm"
            type="button"
            onClick={handleExportCsv}
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            导出 CSV
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg text-body-sm font-body-sm hover:bg-primary/90 transition-colors shadow-sm disabled:cursor-not-allowed disabled:opacity-70"
            type="button"
            onClick={handleRunAiClassification}
            disabled={classifying}
          >
            <span className={`material-symbols-outlined text-[18px] ${classifying ? 'animate-spin-slow' : ''}`}>
              {classifying ? 'progress_activity' : 'psychology'}
            </span>
            {classifying ? 'AI 分类中' : '执行 AI 分类'}
          </button>
        </div>
      </div>

      {actionMessage ? (
        <div
          className={[
            'border rounded-lg px-4 py-3 text-body-sm font-body-sm flex items-start gap-2',
            actionMessage.tone === 'success'
              ? 'bg-tertiary-container border-tertiary/30 text-on-tertiary-container'
              : 'bg-error-container border-error/30 text-on-error-container',
          ].join(' ')}
        >
          <span className="material-symbols-outlined text-[18px]">
            {actionMessage.tone === 'success' ? 'check_circle' : 'error'}
          </span>
          <span>{actionMessage.text}</span>
        </div>
      ) : null}

      {/* ── Filter Bar ───────────────────────────────────────── */}
      <div className="bg-surface border border-outline-variant rounded-xl p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Fault type dropdown */}
          <div className="flex flex-col gap-1.5">
            <label className="font-label-caps text-label-caps text-secondary uppercase">故障类型</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as FaultTypeFilter)}
              className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-body-sm font-body-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            >
              <option value="all">所有类型 (All)</option>
              <option value="信道干扰">信道干扰</option>
              <option value="基站故障">基站故障</option>
              <option value="带宽不足">带宽不足</option>
              <option value="误码过高">误码过高</option>
              <option value="信号中断/覆盖退化">信号中断/覆盖退化</option>
              <option value="未分类异常">未分类异常</option>
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
              <option value="critical">严重</option>
              <option value="warning">预警</option>
              <option value="info">一般</option>
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
              <option value="未处理">未处理</option>
              <option value="处理中">处理中</option>
              <option value="已处理">已处理</option>
              <option value="关闭">关闭</option>
            </select>
          </div>

          {/* Source dropdown */}
          <div className="flex flex-col gap-1.5">
            <label className="font-label-caps text-label-caps text-secondary uppercase">记录来源</label>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
              className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-body-sm font-body-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            >
              <option value="all">全部来源</option>
              <option value="ai">AI识别</option>
              <option value="history">历史样本</option>
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
          <table className="w-full text-left border-collapse min-w-[1050px]">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low">
                <th className="py-3 px-4 font-label-caps text-label-caps text-secondary uppercase tracking-wider w-24">故障编号</th>
                <th className="py-3 px-4 font-label-caps text-label-caps text-secondary uppercase tracking-wider">来源</th>
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
              {pagedFaults.map((fault) => (
                <tr
                  key={fault.fault_id}
                  className="hover:bg-surface-container-lowest transition-colors group cursor-pointer"
                  onClick={() => navigate(`/faults/${fault.fault_id}/diagnosis`)}
                >
                  <td className="py-3 px-4 font-data-mono text-data-mono text-on-surface">{fault.fault_id}</td>
                  <td className="py-3 px-4">
                    <span
                      className={[
                        'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold',
                        isAiFault(fault)
                          ? 'bg-primary/15 text-primary border border-primary/30'
                          : 'bg-surface-container text-on-surface-variant border border-outline-variant',
                      ].join(' ')}
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {isAiFault(fault) ? 'psychology' : 'history'}
                      </span>
                      {isAiFault(fault) ? 'AI识别' : '历史样本'}
                    </span>
                  </td>
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
                    <StatusBadge status={statusBadgeStatus(fault.status)} label={fault.status || '未处理'} size="sm" />
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {nextStatusActions(fault.status).map((action) => (
                        <button
                          key={action.status}
                          className="inline-flex items-center gap-1 rounded border border-outline-variant bg-surface px-2 py-1 text-[11px] font-semibold text-on-surface transition-colors hover:border-primary/50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                          type="button"
                          onClick={(event) => handleUpdateStatus(event, fault, action.status)}
                          disabled={updatingFaultId === fault.fault_id}
                        >
                          <span className={`material-symbols-outlined text-[14px] ${updatingFaultId === fault.fault_id ? 'animate-spin-slow' : ''}`}>
                            {updatingFaultId === fault.fault_id ? 'progress_activity' : action.icon}
                          </span>
                          {action.label}
                        </button>
                      ))}
                      <button
                        className="p-1 text-outline hover:text-primary transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          navigate(`/faults/${fault.fault_id}/diagnosis`)
                        }}
                        aria-label="查看诊断"
                      >
                        <span className="material-symbols-outlined text-[20px]">troubleshoot</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {pagedFaults.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8">
                    {isEmptyDatabase ? (
                      <EmptyState
                        icon="history_toggle_off"
                        title="暂无故障日志"
                        description="当前系统还没有导入网络指标或生成故障分析结果。请先写入数据，再执行 AI 分类或查看诊断建议。"
                        actionLabel="前往系统设置"
                        actionTo="/settings"
                        secondaryActionLabel="地图框选生成"
                        secondaryActionTo="/map"
                        className="border-0 bg-transparent py-4"
                      />
                    ) : (
                      <div className="text-center font-body-sm text-body-sm text-on-surface-variant">
                        当前筛选条件下没有故障记录。
                      </div>
                    )}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <div className="border-t border-outline-variant bg-surface px-4 py-3 flex items-center justify-between">
          <span className="font-body-sm text-body-sm text-on-surface-variant">
            Showing {pageStart} to {pageEnd} of {filteredFaults.length} entries
          </span>
          <div className="flex items-center gap-2">
            <button
              className="w-8 h-8 flex items-center justify-center rounded border border-outline-variant text-outline hover:bg-surface-container-low transition-colors disabled:opacity-50"
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
            </button>
            <span className="min-w-20 text-center font-data-mono text-data-mono text-on-surface-variant">
              {currentPage} / {totalPages}
            </span>
            <button
              className="w-8 h-8 flex items-center justify-center rounded border border-outline-variant text-outline hover:bg-surface-container-low transition-colors"
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            >
              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
