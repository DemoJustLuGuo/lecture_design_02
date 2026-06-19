import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchStations } from '@/api/stations'
import { EmptyState } from '@/components/EmptyState'
import type { Station } from '@/types/api'
import { StationStatus } from '@/types/enums'

/* ── Helpers ─────────────────────────────────────────────────── */

type StatusFilterValue = 'all' | 'normal' | 'warning' | 'severe' | 'offline'
const PAGE_SIZE = 20

function getStationStatusBadge(status: string | null): {
  bg: string
  text: string
  dot: string
  label: string
} {
  switch (status) {
    case StationStatus.Normal:
      return {
        bg: 'bg-emerald-100',
        text: 'text-emerald-800',
        dot: 'bg-emerald-500',
        label: '正常',
      }
    case StationStatus.Warning:
      return {
        bg: 'bg-amber-100',
        text: 'text-amber-800',
        dot: 'bg-amber-500',
        label: '预警',
      }
    case StationStatus.Severe:
      return {
        bg: 'bg-error-container',
        text: 'text-on-error-container',
        dot: 'bg-error',
        label: '严重',
      }
    case StationStatus.Offline:
      return {
        bg: 'bg-surface-variant',
        text: 'text-on-surface-variant',
        dot: 'bg-outline',
        label: '离线',
      }
    default:
      return {
        bg: 'bg-surface-container',
        text: 'text-on-surface-variant',
        dot: 'bg-outline-variant',
        label: status || '--',
      }
  }
}

function getRowClass(status: string | null): string {
  if (status === StationStatus.Severe) return 'bg-error-container/10'
  if (status === StationStatus.Offline) return 'opacity-75'
  return ''
}

/* ── Station Management Page ─────────────────────────────────── */

export default function StationMgmt() {
  const navigate = useNavigate()
  const [stations, setStations] = useState<Station[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all')
  const [page, setPage] = useState(1)

  useEffect(() => {
    fetchStations(200)
      .then((data) => setStations(data))
      .catch((err) => setError(err.message || '数据加载失败'))
      .finally(() => setLoading(false))
  }, [])

  /* ── Client-side filtering ────────────────────────────── */
  const filteredStations = useMemo(() => {
    return stations.filter((station) => {
      // Status filter
      if (statusFilter !== 'all' && station.status !== statusFilter) return false

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        const matchesId = station.station_id?.toLowerCase().includes(q)
        const matchesName = station.gnodeb_id?.toLowerCase().includes(q)
        if (!matchesId && !matchesName) return false
      }

      return true
    })
  }, [stations, statusFilter, searchQuery])

  const totalPages = Math.max(1, Math.ceil(filteredStations.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageStart = filteredStations.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const pageEnd = Math.min(currentPage * PAGE_SIZE, filteredStations.length)
  const pagedStations = filteredStations.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  useEffect(() => {
    setPage(1)
  }, [searchQuery, statusFilter])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  /* ── Loading / Error states ────────────────────────────── */
  if (loading && stations.length === 0) {
    return (
      <div className="max-w-[1200px] mx-auto space-y-gutter animate-fade-in">
        <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-card-padding text-body-sm text-on-surface-variant">
          正在加载基站数据...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-[1200px] mx-auto space-y-gutter animate-fade-in">
        <div className="bg-error-container border border-error/30 rounded-lg p-card-padding text-on-error-container">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[1200px] mx-auto space-y-gutter animate-fade-in">

      {/* ── Header & Filter Bar ──────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-headline-md text-headline-md text-on-surface tracking-tight">基站管理</h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
            管理和查看 gNodeB 工参、位置与运行状态。
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Search input */}
          <div className="relative">
            <span aria-hidden="true" className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">search</span>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 border border-outline-variant rounded-lg bg-surface-container-lowest text-body-sm font-body-sm focus:border-primary focus:ring-1 focus:ring-primary w-48 transition-all"
              placeholder="搜索基站编号或名称"
              type="text"
            />
          </div>

          {/* Status dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilterValue)}
            className="py-2 pl-3 pr-8 border border-outline-variant rounded-lg bg-surface-container-lowest text-body-sm font-body-sm focus:border-primary focus:ring-1 focus:ring-primary appearance-none text-on-surface"
          >
            <option value="all">全部状态</option>
            <option value="normal">正常</option>
            <option value="warning">预警</option>
            <option value="severe">严重</option>
            <option value="offline">离线</option>
          </select>

          <Link
            className="bg-primary text-on-primary border border-primary px-4 py-2 rounded-lg font-label-caps text-label-caps shadow-sm flex items-center gap-2 hover:bg-primary/90 transition-colors"
            to="/settings"
            title="基站由模拟生成或外部导入产生，请在系统设置中写入演示数据。"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">upload_file</span>
            导入数据
          </Link>
        </div>
      </div>

      {/* ── Data Table ───────────────────────────────────────── */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant bg-surface text-secondary font-label-caps text-label-caps uppercase tracking-wider">
                <th className="px-6 py-4 font-semibold">基站编号</th>
                <th className="px-6 py-4 font-semibold">gNodeB ID</th>
                <th className="px-6 py-4 font-semibold">PCI</th>
                <th className="px-6 py-4 font-semibold">经度</th>
                <th className="px-6 py-4 font-semibold">纬度</th>
                <th className="px-6 py-4 font-semibold">状态</th>
                <th className="px-6 py-4 font-semibold text-right">操作</th>
              </tr>
            </thead>
            <tbody className="text-body-sm font-body-sm divide-y divide-outline-variant/50">
              {pagedStations.map((station) => {
                const badge = getStationStatusBadge(station.status)
                const rowClass = getRowClass(station.status)

                return (
                  <tr
                    key={station.station_id}
                    className={`transition-colors group cursor-pointer hover:bg-surface-container-lowest ${rowClass}`}
                    onClick={() => navigate(`/stations/${station.station_id}`)}
                  >
                    <td className="px-6 py-4 font-data-mono text-data-mono text-on-surface">{station.station_id}</td>
                    <td className="px-6 py-4 text-on-surface font-medium">{station.gnodeb_id || '--'}</td>
                    <td className="px-6 py-4 font-data-mono text-data-mono text-on-surface-variant">{station.pci || '--'}</td>
                    <td className="px-6 py-4 font-data-mono text-data-mono text-on-surface-variant">{station.longitude?.toFixed(4) ?? '--'}</td>
                    <td className="px-6 py-4 font-data-mono text-data-mono text-on-surface-variant">{station.latitude?.toFixed(4) ?? '--'}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full ${badge.bg} ${badge.text} text-[11px] font-semibold tracking-wide`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${badge.dot} mr-1.5`} />
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant px-3 py-1.5 text-primary transition-colors hover:bg-primary-container"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          navigate(`/stations/${station.station_id}`)
                        }}
                      >
                        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">visibility</span>
                        查看
                      </button>
                    </td>
                  </tr>
                )
              })}
              {pagedStations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8">
                    {stations.length === 0 ? (
                      <EmptyState
                        icon="cell_tower"
                        title="暂无基站工参数据"
                        description="当前 SQLite 中没有基站记录。请先在系统设置中生成合成数据、导入外部 CSV，或从阶段数据刷新演示库。"
                        actionLabel="前往系统设置"
                        actionTo="/settings"
                        className="border-0 bg-transparent py-4"
                      />
                    ) : (
                      <div className="text-center text-body-sm font-body-sm text-on-surface-variant">
                        当前筛选条件下没有基站记录。
                      </div>
                    )}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="border-t border-outline-variant bg-surface px-6 py-4 flex items-center justify-between">
          <p className="text-body-sm font-body-sm text-on-surface-variant">
            显示第 <span className="font-semibold text-on-surface">{pageStart}</span> 至{' '}
            <span className="font-semibold text-on-surface">{pageEnd}</span> 条，共{' '}
            <span className="font-semibold text-on-surface">{filteredStations.length}</span> 条
          </p>
          <div className="flex items-center space-x-2">
            <button
              className="px-3 py-1 border border-outline-variant rounded bg-surface-container-lowest text-on-surface-variant hover:bg-surface-variant transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px] align-middle">chevron_left</span>
            </button>
            <span className="min-w-20 text-center font-data-mono text-data-mono text-on-surface-variant">
              {currentPage} / {totalPages}
            </span>
            <button
              className="px-3 py-1 border border-outline-variant rounded bg-surface-container-lowest text-on-surface-variant hover:bg-surface-variant transition-colors"
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px] align-middle">chevron_right</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
