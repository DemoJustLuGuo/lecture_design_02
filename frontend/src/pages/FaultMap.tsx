import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchStations } from '@/api/stations'
import { fetchFaults } from '@/api/faults'
import type { Station, FaultLog } from '@/types/api'
import { StationStatus, FaultLevel } from '@/types/enums'

/* ── Color mapping by station status ────────────────────────── */

const statusColorMap: Record<string, string> = {
  [StationStatus.Normal]: '#22c55e',
  [StationStatus.Warning]: '#eab308',
  [StationStatus.Severe]: '#ba1a1a',
  [StationStatus.Offline]: '#9ca3af',
}

const severityOfFault: Record<string, string> = {
  [FaultLevel.Critical]: 'Critical',
  [FaultLevel.Warning]: 'Warning',
  [FaultLevel.Info]: 'Info',
  '严重': 'Critical',
  '预警': 'Warning',
  '警告': 'Warning',
  '一般': 'Info',
  '提示': 'Info',
}

function faultTypeIcon(type: string | null): string {
  if (!type) return 'help'
  if (type.includes('光纤') || type.includes('中断') || type.includes('Fiber')) return 'cable'
  if (type.includes('信号') || type.includes('Signal')) return 'wifi_off'
  if (type.includes('误码') || type.includes('BER')) return 'error'
  if (type.includes('带宽') || type.includes('Bandwidth')) return 'speed'
  if (type.includes('信道') || type.includes('干扰') || type.includes('Interference')) return 'sensors'
  if (type.includes('基站') || type.includes('Station') || type.includes('设备')) return 'router'
  return 'help'
}

/* ── Leaflet CSS injection ──────────────────────────────────── */

const LEAFLET_CSS = `
.leaflet-container { width: 100%; height: 100%; background: #eef2f6; }
.leaflet-control-zoom { border: none !important; }
.leaflet-control-zoom a { background: #f8f9ff !important; color: #0b1c30 !important; border: 1px solid #c7c4d7 !important; border-radius: 8px !important; }
.leaflet-control-zoom a:hover { background: #eff4ff !important; }
.pulse-ring-marker {
  position: relative;
}
.pulse-ring-marker::after {
  content: '';
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  border: 2px solid #ba1a1a;
  animation: mapPulse 2s infinite cubic-bezier(0.2, 0, 0, 1);
}
@keyframes mapPulse {
  0% { transform: scale(1); opacity: 0.8; }
  50% { transform: scale(1.6); opacity: 0; }
  100% { transform: scale(1); opacity: 0; }
}
.station-marker-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 2px solid white;
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
  transition: transform 0.2s;
}
.station-marker-icon:hover {
  transform: scale(1.3);
}
.fault-marker-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 2px solid white;
  box-shadow: 0 2px 6px rgba(0,0,0,0.25);
  animation: expandInNode 400ms cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
}
@keyframes expandInNode {
  0% { transform: scale(0); opacity: 0; }
  100% { transform: scale(1.1); opacity: 1; }
}
@keyframes fadeInContent {
  0% { opacity: 0; transform: translateY(10px); }
  100% { opacity: 1; transform: translateY(0); }
}
.animate-fade-in { animation: fadeInContent 600ms ease-out forwards; }
.animate-count-up {
  animation: countUpValue 500ms ease-out forwards;
  opacity: 0;
  animation-fill-mode: forwards;
}
@keyframes countUpValue {
  0% { opacity: 0; transform: translateY(5px); }
  100% { opacity: 1; transform: translateY(0); }
}
.delay-100 { animation-delay: 100ms; }
.delay-200 { animation-delay: 200ms; }
.delay-300 { animation-delay: 300ms; }
`

/* ── FaultMap Page ──────────────────────────────────────────── */

export default function FaultMap() {
  const navigate = useNavigate()
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const [stations, setStations] = useState<Station[]>([])
  const [faults, setFaults] = useState<FaultLog[]>([])
  const [selectedFault, setSelectedFault] = useState<FaultLog | null>(null)

  /* ── Inject Leaflet CSS ──────────────────────────────── */
  useEffect(() => {
    const styleEl = document.createElement('style')
    styleEl.textContent = LEAFLET_CSS
    document.head.appendChild(styleEl)
    return () => { document.head.removeChild(styleEl) }
  }, [])

  /* ── Fetch data ──────────────────────────────────────── */
  useEffect(() => {
    Promise.all([fetchStations(200), fetchFaults(200)])
      .then(([stationData, faultData]) => {
        setStations(stationData)
        setFaults(faultData)
      })
      .catch(() => {})
  }, [])

  /* ── Initialize Leaflet map ──────────────────────────── */
  useEffect(() => {
    if (!mapContainerRef.current) return

    // Dynamic import for Leaflet to avoid SSR/bundle issues
    import('leaflet').then((L) => {
      const map = L.map(mapContainerRef.current!, {
        center: [23.1, 113.3], // Default center (Pearl River Delta region)
        zoom: 8,
        zoomControl: true,
        attributionControl: false,
      })

      // CartoDB Positron basemap (light, no labels)
      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
        {
          subdomains: 'abcd',
          maxZoom: 19,
        },
      ).addTo(map)

      mapInstanceRef.current = map
    })

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [])

  /* ── Add markers when data arrives ────────────────────── */
  useEffect(() => {
    if (!mapInstanceRef.current || stations.length === 0) return

    import('leaflet').then((L) => {
      const map = mapInstanceRef.current!
      const markerGroup = L.featureGroup()

      // Station markers
      stations.forEach((station) => {
        if (station.latitude == null || station.longitude == null) return

        const color = statusColorMap[station.status ?? ''] ?? '#9ca3af'
        const isOffline = station.status === StationStatus.Offline
        const size = station.status === StationStatus.Severe ? 20 : 16

        const icon = L.divIcon({
          className: '',
          html: `<div class="station-marker-icon" style="width:${size}px;height:${size}px;background:${color};opacity:${isOffline ? 0.6 : 1};">
            ${station.status === StationStatus.Warning ? '<span class="material-symbols-outlined" style="color:white;font-size:12px;">warning</span>' : ''}
            ${station.status === StationStatus.Severe ? '<span class="material-symbols-outlined" style="color:white;font-size:14px;">error</span>' : ''}
          </div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        })

        const marker = L.marker([station.latitude, station.longitude], { icon })
        marker.bindTooltip(station.station_id, {
          permanent: false,
          direction: 'top',
          className: 'leaflet-tooltip',
        })
        marker.addTo(markerGroup)
      })

      // Fault markers (with pulse animation)
      faults.forEach((fault) => {
        if (fault.fault_latitude == null || fault.fault_longitude == null) return
        // Skip if the fault level is not critical/severe
        if (fault.fault_level !== FaultLevel.Critical && fault.fault_level !== '严重') return

        const icon = L.divIcon({
          className: '',
          html: `<div class="pulse-ring-marker">
            <div class="fault-marker-icon" style="width:24px;height:24px;background:#ba1a1a;">
              <span class="material-symbols-outlined" style="color:white;font-size:14px;">error</span>
            </div>
          </div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        })

        const marker = L.marker([fault.fault_latitude, fault.fault_longitude], { icon })
        marker.on('click', () => {
          setSelectedFault(fault)
        })
        marker.addTo(markerGroup)
      })

      markerGroup.addTo(map)

      // Fit bounds to markers if available
      if (markerGroup.getLayers().length > 0) {
        map.fitBounds(markerGroup.getBounds().pad(0.1))
      }
    })
  }, [stations, faults])

  /* ── Compute stats ────────────────────────────────────── */
  const totalStations = stations.length
  const totalFaults = faults.length
  const onlineStations = stations.filter(
    (s) => s.status !== StationStatus.Offline,
  ).length
  const onlineRate = totalStations > 0
    ? `${Math.round((onlineStations / totalStations) * 100)}%`
    : '--'

  const selectedConfidence = selectedFault?.confidence != null
    ? `${(selectedFault.confidence * 100).toFixed(1)}%`
    : '--'

  const selectedErrorRange = selectedFault?.localization_error_m != null
    ? `± ${selectedFault.localization_error_m.toFixed(0)}m`
    : '--'

  const faultStats = [
    { label: '光纤中断 (Fiber Cut)', count: 12, pct: 60, color: '#ba1a1a' },
    { label: '设备掉线 (Node Offline)', count: 8, pct: 40, color: '#eab308' },
    { label: '高延迟 (High Latency)', count: 24, pct: 85, color: '#2a14b4' },
  ]

  return (
    <div className="flex-1 mt-header-height relative bg-surface-container-highest overflow-hidden animate-fade-in">

      {/* ── Leaflet Map ─────────────────────────────────────── */}
      <div ref={mapContainerRef} className="absolute inset-0 z-0" />

      {/* ── Map Stats Overlay (Top-Left) ────────────────────── */}
      <div className="absolute top-6 left-6 flex flex-col gap-2 z-20">
        <div className="bg-surface border border-outline-variant rounded-xl p-3 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)] flex items-center gap-3 animate-fade-in">
          <span className="material-symbols-outlined text-emerald-600 icon-fill text-[20px]">wifi</span>
          <div className="flex flex-col">
            <span className="font-label-caps text-[10px] text-on-surface-variant uppercase">Stations</span>
            <span className="font-data-mono text-data-mono text-on-surface font-bold animate-count-up delay-100">{totalStations}</span>
          </div>
        </div>
        <div className="bg-surface border border-outline-variant rounded-xl p-3 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)] flex items-center gap-3 animate-fade-in">
          <span className="material-symbols-outlined text-error icon-fill text-[20px]">warning</span>
          <div className="flex flex-col">
            <span className="font-label-caps text-[10px] text-on-surface-variant uppercase">Faults</span>
            <span className="font-data-mono text-data-mono text-on-surface font-bold animate-count-up delay-200">{totalFaults}</span>
          </div>
        </div>
        <div className="bg-surface border border-outline-variant rounded-xl p-3 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)] flex items-center gap-3 animate-fade-in">
          <span className="material-symbols-outlined text-primary icon-fill text-[20px]">cell_tower</span>
          <div className="flex flex-col">
            <span className="font-label-caps text-[10px] text-on-surface-variant uppercase">Online</span>
            <span className="font-data-mono text-data-mono text-on-surface font-bold animate-count-up delay-300">{onlineRate}</span>
          </div>
        </div>
      </div>

      {/* ── Bottom Left Legend Overlay ───────────────────────── */}
      <div className="absolute bottom-6 left-6 bg-surface border border-outline-variant p-4 rounded-xl shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)] z-20">
        <h4 className="font-label-caps text-label-caps text-on-surface-variant mb-3 uppercase tracking-wider">Station Status</h4>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#22c55e]" />
            <span className="font-body-sm text-body-sm text-on-surface">正常 (Normal)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#eab308]" />
            <span className="font-body-sm text-body-sm text-on-surface">警告 (Warning)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-error" />
            <span className="font-body-sm text-body-sm text-on-surface">故障 (Fault)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-outline-variant" />
            <span className="font-body-sm text-body-sm text-on-surface">离线 (Offline)</span>
          </div>
        </div>
      </div>

      {/* ── Right Info Panel ─────────────────────────────────── */}
      <aside className="absolute top-6 right-6 bottom-6 w-[320px] bg-surface border border-outline-variant rounded-xl shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)] z-20 flex flex-col overflow-hidden animate-fade-in">
        {selectedFault ? (
          <>
            {/* Panel Header */}
            <div className="px-5 py-4 border-b border-outline-variant bg-surface-container-lowest flex items-center justify-between">
              <h2 className="font-headline-md text-headline-md text-on-surface">当前选中故障</h2>
              <span className="px-2 py-0.5 bg-error-container text-on-error-container font-label-caps text-[10px] rounded uppercase">
                {severityOfFault[selectedFault.fault_level ?? ''] ?? 'Info'}
              </span>
            </div>

            {/* Fault Details */}
            <div className="p-5 flex flex-col gap-5 border-b border-outline-variant">
              {/* Type */}
              <div className="flex flex-col gap-1">
                <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">Type</span>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-error">{faultTypeIcon(selectedFault.fault_type_cn)}</span>
                  <span className="font-body-base text-body-base font-semibold text-on-surface">
                    {selectedFault.fault_type_cn || '未知故障'}
                  </span>
                </div>
              </div>

              {/* Station */}
              <div className="flex flex-col gap-1">
                <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">Station</span>
                <span className="font-data-mono text-data-mono text-on-surface">
                  {selectedFault.station_id || 'Unknown'}
                </span>
              </div>

              {/* Metric boxes */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1 p-3 bg-surface-container-low rounded-lg border border-outline-variant/50">
                  <span className="font-label-caps text-[10px] text-on-surface-variant uppercase">AI Confidence</span>
                  <span className="font-data-mono text-[18px] leading-tight font-bold text-error animate-count-up delay-100">
                    {selectedConfidence}
                  </span>
                </div>
                <div className="flex flex-col gap-1 p-3 bg-surface-container-low rounded-lg border border-outline-variant/50">
                  <span className="font-label-caps text-[10px] text-on-surface-variant uppercase">Error Range</span>
                  <span className="font-data-mono text-[18px] leading-tight font-bold text-on-surface animate-count-up delay-200">
                    {selectedErrorRange}
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col gap-2 mt-2">
                <button
                  className="w-full py-2 bg-primary text-on-primary font-body-base rounded-lg hover:bg-primary/90 transition-colors shadow-sm flex justify-center items-center gap-2"
                  type="button"
                  onClick={() => navigate(`/faults/${selectedFault.fault_id}/diagnosis`)}
                >
                  <span className="material-symbols-outlined text-[18px]">build</span>
                  查看诊断建议
                </button>
                <button
                  className="w-full py-2 bg-surface border border-outline-variant text-on-surface font-body-base rounded-lg hover:bg-surface-container-low transition-colors shadow-sm flex justify-center items-center gap-2"
                  type="button"
                  onClick={() => navigate(`/stations/${selectedFault.station_id}`)}
                >
                  <span className="material-symbols-outlined text-[18px]">router</span>
                  查看基站详情
                </button>
              </div>
            </div>

            {/* Network Stats */}
            <div className="p-5 flex-1 flex flex-col overflow-y-auto">
              <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-4 uppercase">全网故障统计</h3>
              <div className="flex flex-col gap-4">
                {faultStats.map((stat) => (
                  <div key={stat.label} className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center">
                      <span className="font-body-sm text-body-sm text-on-surface">{stat.label}</span>
                      <span className="font-data-mono text-data-mono font-bold animate-count-up delay-100" style={{ color: stat.color }}>
                        {stat.count}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ backgroundColor: stat.color, width: `${stat.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          /* ── No fault selected placeholder ────────────────── */
          <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
            <span className="material-symbols-outlined text-on-surface-variant text-[48px]">touch_app</span>
            <h3 className="font-headline-md text-headline-md text-on-surface-variant">点击地图标记查看故障详情</h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant text-center">
              Select a fault marker on the map to view detailed information, AI confidence scores, and diagnostic suggestions.
            </p>
          </div>
        )}
      </aside>
    </div>
  )
}
