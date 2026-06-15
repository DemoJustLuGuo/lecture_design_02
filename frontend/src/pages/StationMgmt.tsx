import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchStations } from '@/api/stations'
import type { Station } from '@/types/api'
import { StationStatus } from '@/types/enums'

/* ── Helpers ─────────────────────────────────────────────────── */

type StatusFilterValue = 'all' | 'normal' | 'warning' | 'severe' | 'offline'

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
        label: '正常 (Normal)',
      }
    case StationStatus.Warning:
      return {
        bg: 'bg-amber-100',
        text: 'text-amber-800',
        dot: 'bg-amber-500',
        label: '预警 (Warning)',
      }
    case StationStatus.Severe:
      return {
        bg: 'bg-error-container',
        text: 'text-on-error-container',
        dot: 'bg-error',
        label: '严重 (Severe)',
      }
    case StationStatus.Offline:
      return {
        bg: 'bg-surface-variant',
        text: 'text-on-surface-variant',
        dot: 'bg-outline',
        label: '离线 (Offline)',
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
          <h2 className="font-headline-md text-headline-md text-on-surface tracking-tight">基站管理 (Base Station Management)</h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
            Manage and monitor gNodeB operational status.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Search input */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">search</span>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 border border-outline-variant rounded-lg bg-surface-container-lowest text-body-sm font-body-sm focus:border-primary focus:ring-1 focus:ring-primary w-48 transition-all"
              placeholder="Search ID or Name"
              type="text"
            />
          </div>

          {/* Status dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilterValue)}
            className="py-2 pl-3 pr-8 border border-outline-variant rounded-lg bg-surface-container-lowest text-body-sm font-body-sm focus:border-primary focus:ring-1 focus:ring-primary appearance-none text-on-surface"
          >
            <option value="all">All Status (全部)</option>
            <option value="normal">Normal (正常)</option>
            <option value="warning">Warning (预警)</option>
            <option value="severe">Severe (严重)</option>
            <option value="offline">Offline (离线)</option>
          </select>

          {/* New Station button */}
          <button
            className="bg-primary text-on-primary px-4 py-2 rounded-lg font-label-caps text-label-caps hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-2"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            NEW STATION
          </button>
        </div>
      </div>

      {/* ── Data Table ───────────────────────────────────────── */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant bg-surface text-secondary font-label-caps text-label-caps uppercase tracking-wider">
                <th className="px-6 py-4 font-semibold">基站编号 (ID)</th>
                <th className="px-6 py-4 font-semibold">基站名称 (gNodeB ID)</th>
                <th className="px-6 py-4 font-semibold">PCI</th>
                <th className="px-6 py-4 font-semibold">经度 (Lon)</th>
                <th className="px-6 py-4 font-semibold">纬度 (Lat)</th>
                <th className="px-6 py-4 font-semibold">状态 (Status)</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-body-sm font-body-sm divide-y divide-outline-variant/50">
              {filteredStations.map((station) => {
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
                      <button className="text-secondary hover:text-primary transition-colors p-1" type="button">
                        <span className="material-symbols-outlined text-[20px]">more_vert</span>
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="border-t border-outline-variant bg-surface px-6 py-4 flex items-center justify-between">
          <p className="text-body-sm font-body-sm text-on-surface-variant">
            Showing <span className="font-semibold text-on-surface">1</span> to{' '}
            <span className="font-semibold text-on-surface">{Math.min(filteredStations.length, 10)}</span> of{' '}
            <span className="font-semibold text-on-surface">{filteredStations.length}</span> entries
          </p>
          <div className="flex items-center space-x-2">
            <button
              className="px-3 py-1 border border-outline-variant rounded bg-surface-container-lowest text-on-surface-variant hover:bg-surface-variant transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              type="button"
              disabled
            >
              <span className="material-symbols-outlined text-[18px] align-middle">chevron_left</span>
            </button>
            <button
              className="px-3 py-1 border border-primary bg-primary text-on-primary rounded font-data-mono text-data-mono"
              type="button"
            >
              1
            </button>
            <button
              className="px-3 py-1 border border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-variant rounded transition-colors font-data-mono text-data-mono"
              type="button"
            >
              2
            </button>
            <button
              className="px-3 py-1 border border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-variant rounded transition-colors font-data-mono text-data-mono"
              type="button"
            >
              3
            </button>
            <span className="px-2 text-on-surface-variant">...</span>
            <button
              className="px-3 py-1 border border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-variant rounded transition-colors font-data-mono text-data-mono"
              type="button"
            >
              102
            </button>
            <button
              className="px-3 py-1 border border-outline-variant rounded bg-surface-container-lowest text-on-surface-variant hover:bg-surface-variant transition-colors"
              type="button"
            >
              <span className="material-symbols-outlined text-[18px] align-middle">chevron_right</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
