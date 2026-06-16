import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import 'leaflet/dist/leaflet.css'
import { fetchStations } from '@/api/stations'
import { fetchFaults } from '@/api/faults'
import { commitSimulationPreview, generateAreaSimulationData } from '@/api/simulation'
import type { Station, FaultLog, SimulationGenerateResult, SimulationResult } from '@/types/api'
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

function isAiFault(fault: FaultLog): boolean {
  return fault.fault_id.startsWith('AI_')
}

function hasFaultCoordinates(fault: FaultLog): boolean {
  const latitude = fault.fault_latitude
  const longitude = fault.fault_longitude
  return latitude != null && longitude != null && Number.isFinite(latitude) && Number.isFinite(longitude)
}

function isCriticalFault(fault: FaultLog): boolean {
  return fault.fault_level === FaultLevel.Critical || fault.fault_level === '严重'
}

function isWarningFault(fault: FaultLog): boolean {
  return fault.fault_level === FaultLevel.Warning || fault.fault_level === '预警' || fault.fault_level === '警告'
}

function faultSourceLabel(fault: FaultLog): string {
  return isAiFault(fault) ? 'AI识别入库' : '历史样本'
}

function faultMarkerConfig(fault: FaultLog): { color: string; icon: string; pulse: boolean } {
  if (isAiFault(fault)) return { color: '#2a14b4', icon: 'psychology', pulse: false }
  if (isCriticalFault(fault)) return { color: '#ba1a1a', icon: 'error', pulse: true }
  if (isWarningFault(fault)) return { color: '#eab308', icon: 'warning', pulse: false }
  return { color: '#2563eb', icon: faultTypeIcon(fault.fault_type_cn), pulse: false }
}

function formatConfidence(confidence: number | null): string {
  if (confidence == null) return '--'
  const percent = confidence <= 1 ? confidence * 100 : confidence
  return `${percent.toFixed(1)}%`
}

function formatFaultCoordinate(fault: FaultLog): string {
  if (!hasFaultCoordinates(fault)) return '暂无故障坐标'
  return `${fault.fault_latitude!.toFixed(6)}, ${fault.fault_longitude!.toFixed(6)}`
}

const faultStatColors = ['#ba1a1a', '#eab308', '#2a14b4', '#2563eb', '#16a34a']

type MapPoint = {
  lat: number
  lng: number
}

type AreaBounds = {
  min_lng: number
  min_lat: number
  max_lng: number
  max_lat: number
}

function buildFaultStats(faults: FaultLog[]) {
  const counts = new Map<string, number>()
  faults.forEach((fault) => {
    const label = fault.fault_type_cn || '未知故障'
    counts.set(label, (counts.get(label) ?? 0) + 1)
  })
  const maxCount = Math.max(1, ...counts.values())
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count], index) => ({
      label,
      count,
      pct: Math.round((count / maxCount) * 100),
      color: faultStatColors[index % faultStatColors.length],
    }))
}

function countText(value: number | undefined): string {
  if (value == null) return '--'
  return value.toLocaleString('zh-CN')
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

/* ── Leaflet CSS injection ──────────────────────────────────── */

const MAP_TILE_LAYERS = [
  {
    name: '高德地图',
    url: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}',
    options: { subdomains: '1234', maxZoom: 18 },
  },
  {
    name: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: {
      subdomains: 'abc',
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    },
  },
]

const LEAFLET_CSS = `
.leaflet-container { width: 100%; height: 100%; background: #eef2f6; }
.leaflet-control-zoom { border: none !important; }
.leaflet-left .leaflet-control { margin-left: 16px !important; }
.leaflet-top .leaflet-control { margin-top: 92px !important; }
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
  const markerGroupRef = useRef<any>(null)
  const selectionLayerRef = useRef<any>(null)
  const selectionClickHandlerRef = useRef<((event: any) => void) | null>(null)
  const [stations, setStations] = useState<Station[]>([])
  const [faults, setFaults] = useState<FaultLog[]>([])
  const [selectedFault, setSelectedFault] = useState<FaultLog | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectionActive, setSelectionActive] = useState(false)
  const [selectionStart, setSelectionStart] = useState<MapPoint | null>(null)
  const [selectedBounds, setSelectedBounds] = useState<AreaBounds | null>(null)
  const [stationCount, setStationCount] = useState(12)
  const [metricCount, setMetricCount] = useState(3000)
  const [faultRatio, setFaultRatio] = useState(0.15)
  const [enableTriangulation, setEnableTriangulation] = useState(true)
  const [simulating, setSimulating] = useState(false)
  const [persistingGeneratedData, setPersistingGeneratedData] = useState(false)
  const [simulationMessage, setSimulationMessage] = useState<string | null>(null)
  const [simulationError, setSimulationError] = useState<string | null>(null)
  const [tileLoadError, setTileLoadError] = useState<string | null>(null)
  const [tileLayerName, setTileLayerName] = useState<string>('在线地图')
  const [pendingGeneration, setPendingGeneration] = useState<SimulationGenerateResult | null>(null)
  const [lastPersistResult, setLastPersistResult] = useState<SimulationResult | null>(null)

  const reloadMapData = useCallback(async () => {
    const [stationData, faultData] = await Promise.all([fetchStations(200), fetchFaults(200)])
    setStations(stationData)
    setFaults(faultData)
    setLoadError(null)
  }, [])

  const drawSelectedBounds = useCallback((bounds: AreaBounds | null) => {
    const map = mapInstanceRef.current
    if (!map) return

    import('leaflet').then((L) => {
      if (selectionLayerRef.current) {
        selectionLayerRef.current.remove()
        selectionLayerRef.current = null
      }
      if (!bounds) return

      const rectangle = L.rectangle(
        [
          [bounds.min_lat, bounds.min_lng],
          [bounds.max_lat, bounds.max_lng],
        ],
        {
          color: '#2a14b4',
          weight: 2,
          fillColor: '#2a14b4',
          fillOpacity: 0.08,
          dashArray: '6 4',
        },
      )
      rectangle.addTo(map)
      selectionLayerRef.current = rectangle
    })
  }, [])

  const clearSelection = useCallback(() => {
    setSelectionActive(false)
    setSelectionStart(null)
    setSelectedBounds(null)
    setSimulationMessage(null)
    setSimulationError(null)
    setPendingGeneration(null)
    drawSelectedBounds(null)
  }, [drawSelectedBounds])

  const handleStartSelection = useCallback(() => {
    setSelectionActive(true)
    setSelectionStart(null)
    setSelectedBounds(null)
    setSimulationMessage('请在地图上点击两个对角点确定模拟区域。')
    setSimulationError(null)
    setPendingGeneration(null)
    drawSelectedBounds(null)
  }, [drawSelectedBounds])

  const handleGenerateArea = useCallback(async () => {
    if (!selectedBounds) {
      setSimulationError('请先在地图上选择模拟区域。')
      return
    }

    setSimulating(true)
    setSimulationError(null)
    setLastPersistResult(null)
    setPendingGeneration(null)
    setSimulationMessage('正在生成区域模拟数据预览，暂不写入 SQLite...')
    try {
      const result = await generateAreaSimulationData({
        ...selectedBounds,
        station_count: stationCount,
        metric_count: metricCount,
        fault_ratio: faultRatio,
        enable_triangulation: enableTriangulation,
        refresh_db: false,
      })
      const locatedCount = result.generated_files?.fault_samples ?? 0
      const observationCount = result.generated_files?.triangulation_observations ?? 0
      setPendingGeneration(result)
      setSimulationMessage(`区域模拟预览已生成：${locatedCount} 条故障样本，${observationCount} 条三基站定位观测；预览批次尚未写入 SQLite。`)
      setSelectionActive(false)
      setSelectionStart(null)
    } catch (err) {
      setSimulationError(err instanceof Error ? err.message : '区域模拟生成失败')
    } finally {
      setSimulating(false)
    }
  }, [enableTriangulation, faultRatio, metricCount, selectedBounds, stationCount])

  const handlePersistGeneratedData = useCallback(async () => {
    if (!pendingGeneration) return
    if (!pendingGeneration.preview_id) {
      setSimulationError('缺少预览批次ID，无法确认写入 SQLite。')
      return
    }

    setPersistingGeneratedData(true)
    setSimulationError(null)
    try {
      const result = await commitSimulationPreview(pendingGeneration.preview_id)
      setLastPersistResult(result)
      setPendingGeneration(null)
      setSelectedFault(null)
      await reloadMapData()
      setSimulationMessage(result.message || '预览数据已写入 SQLite，地图数据已刷新。')
    } catch (err) {
      setSimulationError(err instanceof Error ? err.message : '写入 SQLite 失败')
    } finally {
      setPersistingGeneratedData(false)
    }
  }, [pendingGeneration, reloadMapData])

  const handleDiscardGeneratedData = useCallback(() => {
    setPendingGeneration(null)
    setLastPersistResult(null)
    setSimulationMessage('已取消写入 SQLite。当前地图仍显示原数据库中的数据。')
  }, [])

  /* ── Inject Leaflet CSS ──────────────────────────────── */
  useEffect(() => {
    const styleEl = document.createElement('style')
    styleEl.textContent = LEAFLET_CSS
    document.head.appendChild(styleEl)
    return () => { document.head.removeChild(styleEl) }
  }, [])

  /* ── Fetch data ──────────────────────────────────────── */
  useEffect(() => {
    reloadMapData()
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : '地图数据加载失败')
      })
  }, [reloadMapData])

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

      let activeLayerIndex = 0
      let switchedFallback = false
      const addTileLayer = (index: number) => {
        const config = MAP_TILE_LAYERS[index]
        setTileLayerName(config.name)
        const tileLayer = L.tileLayer(config.url, config.options)
        tileLayer.on('tileerror', () => {
          if (!switchedFallback && index + 1 < MAP_TILE_LAYERS.length) {
            switchedFallback = true
            activeLayerIndex = index + 1
            map.removeLayer(tileLayer)
            setTileLoadError(`${config.name}加载失败，已切换备用在线底图。`)
            addTileLayer(activeLayerIndex)
            return
          }
          setTileLoadError('在线地图瓦片加载失败，请检查网络连接或稍后刷新页面。')
        })
        tileLayer.on('load', () => {
          setTileLoadError(null)
          setTileLayerName(config.name)
        })
        tileLayer.addTo(map)
      }
      addTileLayer(activeLayerIndex)

      mapInstanceRef.current = map
    })

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    if (selectionClickHandlerRef.current) {
      map.off('click', selectionClickHandlerRef.current)
      selectionClickHandlerRef.current = null
    }

    if (!selectionActive) return

    const handler = (event: any) => {
      const point = { lat: event.latlng.lat, lng: event.latlng.lng }
      if (!selectionStart) {
        setSelectionStart(point)
        setSimulationMessage('已选择第一个点，请点击区域的对角点。')
        return
      }

      const bounds = {
        min_lng: Math.min(selectionStart.lng, point.lng),
        min_lat: Math.min(selectionStart.lat, point.lat),
        max_lng: Math.max(selectionStart.lng, point.lng),
        max_lat: Math.max(selectionStart.lat, point.lat),
      }
      setSelectedBounds(bounds)
      setSelectionStart(null)
      setSelectionActive(false)
      setSimulationMessage('模拟区域已确定，可调整参数后生成数据。')
      drawSelectedBounds(bounds)
    }

    map.on('click', handler)
    selectionClickHandlerRef.current = handler
    return () => {
      map.off('click', handler)
      if (selectionClickHandlerRef.current === handler) {
        selectionClickHandlerRef.current = null
      }
    }
  }, [drawSelectedBounds, selectionActive, selectionStart])

  /* ── Add markers when data arrives ────────────────────── */
  useEffect(() => {
    if (!mapInstanceRef.current || stations.length === 0) return

    import('leaflet').then((L) => {
      const map = mapInstanceRef.current!
      if (markerGroupRef.current) {
        markerGroupRef.current.remove()
        markerGroupRef.current = null
      }
      const markerGroup = L.featureGroup()
      markerGroupRef.current = markerGroup

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

      // Fault markers
      faults.forEach((fault) => {
        if (!hasFaultCoordinates(fault)) return

        const config = faultMarkerConfig(fault)
        const markerHtml = `
          <div class="${config.pulse ? 'pulse-ring-marker' : ''}">
            <div class="fault-marker-icon" style="width:24px;height:24px;background:${config.color};">
              <span class="material-symbols-outlined" style="color:white;font-size:14px;">${config.icon}</span>
            </div>
          </div>`
        const icon = L.divIcon({
          className: '',
          html: markerHtml,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        })

        const marker = L.marker([fault.fault_latitude!, fault.fault_longitude!], { icon })
        marker.bindTooltip(`${faultSourceLabel(fault)} · ${fault.fault_type_cn ?? '未知故障'}`, {
          permanent: false,
          direction: 'top',
          className: 'leaflet-tooltip',
        })
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
  const locatedFaults = useMemo(() => faults.filter(hasFaultCoordinates), [faults])
  const unlocatedFaults = useMemo(() => faults.filter((fault) => !hasFaultCoordinates(fault)), [faults])
  const aiLocatedFaults = useMemo(() => locatedFaults.filter(isAiFault), [locatedFaults])
  const onlineStations = stations.filter(
    (s) => s.status !== StationStatus.Offline,
  ).length
  const onlineRate = totalStations > 0
    ? `${Math.round((onlineStations / totalStations) * 100)}%`
    : '--'

  const selectedConfidence = selectedFault ? formatConfidence(selectedFault.confidence) : '--'

  const selectedErrorRange = selectedFault?.localization_error_m != null
    ? `± ${selectedFault.localization_error_m.toFixed(0)}m`
    : '--'

  const faultStats = useMemo(() => buildFaultStats(faults), [faults])

  return (
    <div className="relative h-full min-h-0 w-full bg-surface-container-highest overflow-hidden animate-fade-in">

      {/* ── Leaflet Map ─────────────────────────────────────── */}
      <div ref={mapContainerRef} className="absolute inset-0 z-0" />

      {tileLoadError ? (
        <div className="absolute left-1/2 top-6 z-30 -translate-x-1/2 rounded-lg border border-error/30 bg-error-container px-4 py-2 text-body-sm font-body-sm text-on-error-container shadow-lg">
          {tileLoadError}
        </div>
      ) : null}

      {/* ── Top Status Bar ─────────────────────────────────── */}
      <div
        data-testid="map-status-bar"
        className="pointer-events-none absolute left-4 right-4 top-4 z-20 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 md:left-20 xl:right-[360px]"
      >
        {[
          { icon: 'wifi', label: '基站', value: totalStations, color: 'text-emerald-600' },
          { icon: 'warning', label: '地图故障', value: `${locatedFaults.length}/${totalFaults}`, color: 'text-error' },
          { icon: 'location_off', label: '无坐标', value: unlocatedFaults.length, color: 'text-outline' },
          { icon: 'psychology', label: 'AI定位', value: aiLocatedFaults.length, color: 'text-primary' },
          { icon: 'cell_tower', label: '在线率', value: onlineRate, color: 'text-primary' },
          { icon: 'map', label: '底图', value: tileLayerName, color: 'text-cyan-700' },
        ].map((item) => (
          <div
            key={item.label}
            className="pointer-events-auto flex min-w-[112px] max-w-[160px] items-center gap-2 rounded-lg border border-outline-variant bg-surface/95 px-3 py-2 shadow-sm backdrop-blur"
          >
            <span className={`material-symbols-outlined icon-fill text-[18px] ${item.color}`}>{item.icon}</span>
            <div className="min-w-0">
              <div className="font-label-caps text-[10px] uppercase leading-4 text-on-surface-variant">{item.label}</div>
              <div className="truncate font-data-mono text-data-mono font-bold leading-5 text-on-surface" title={String(item.value)}>
                {item.value}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Area Simulation Controls ─────────────────────────── */}
      <div
        data-testid="map-simulation-panel"
        className="absolute bottom-6 left-4 z-20 w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-outline-variant bg-surface/95 shadow-lg backdrop-blur md:left-6"
      >
        <div className="flex items-center justify-between gap-3 border-b border-outline-variant bg-surface-container-lowest px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">draw</span>
            <div className="min-w-0">
              <h2 className="truncate font-headline-md text-[16px] leading-tight text-on-surface">区域数据模拟</h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">先生成预览，再确认写入 SQLite</p>
            </div>
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant bg-surface text-on-surface transition-colors hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-60"
            onClick={clearSelection}
            disabled={simulating || persistingGeneratedData}
            title="清除选择"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div className="flex max-h-[58vh] flex-col gap-3 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={[
                'h-10 inline-flex items-center justify-center gap-2 rounded-lg border px-3 text-body-sm font-body-sm transition-colors',
                selectionActive
                  ? 'border-primary bg-primary-container text-on-primary-container'
                  : 'border-outline-variant bg-surface text-on-surface hover:bg-surface-container-low',
              ].join(' ')}
              onClick={handleStartSelection}
              disabled={simulating || persistingGeneratedData}
              title="在地图上选择区域"
            >
              <span className="material-symbols-outlined text-[18px]">{selectionActive ? 'my_location' : 'crop_square'}</span>
              {selectionActive ? '选取中' : '框选区域'}
            </button>
            <button
              type="button"
              className="h-10 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 text-body-sm font-body-sm text-on-primary shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleGenerateArea}
              disabled={!selectedBounds || simulating || persistingGeneratedData}
              title="生成区域模拟数据预览"
            >
              <span className={`material-symbols-outlined text-[18px] ${simulating ? 'animate-spin-slow' : ''}`}>
                {simulating ? 'progress_activity' : 'preview'}
              </span>
              {simulating ? '生成中' : '生成预览'}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1">
              <span className="font-label-caps text-[10px] uppercase text-on-surface-variant">Stations</span>
              <input
                type="number"
                min={3}
                max={500}
                value={stationCount}
                onChange={(event) => setStationCount(Number(event.target.value))}
                className="h-9 rounded-lg border border-outline-variant bg-surface px-2 font-data-mono text-data-mono text-on-surface outline-none focus:border-primary"
                disabled={simulating || persistingGeneratedData}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-label-caps text-[10px] uppercase text-on-surface-variant">Metrics</span>
              <input
                type="number"
                min={1}
                max={200000}
                step={500}
                value={metricCount}
                onChange={(event) => setMetricCount(Number(event.target.value))}
                className="h-9 rounded-lg border border-outline-variant bg-surface px-2 font-data-mono text-data-mono text-on-surface outline-none focus:border-primary"
                disabled={simulating || persistingGeneratedData}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-label-caps text-[10px] uppercase text-on-surface-variant">Fault</span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={faultRatio}
                onChange={(event) => setFaultRatio(Number(event.target.value))}
                className="h-9 rounded-lg border border-outline-variant bg-surface px-2 font-data-mono text-data-mono text-on-surface outline-none focus:border-primary"
                disabled={simulating || persistingGeneratedData}
              />
            </label>
          </div>

          <label className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2">
            <span className="font-body-sm text-body-sm text-on-surface">三基站测距定位</span>
            <input
              type="checkbox"
              checked={enableTriangulation}
              onChange={(event) => setEnableTriangulation(event.target.checked)}
              className="h-4 w-4 accent-primary"
              disabled={simulating || persistingGeneratedData}
            />
          </label>

          <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-on-surface-variant text-[16px]">select_all</span>
              <span className="font-label-caps text-[10px] uppercase text-on-surface-variant">Bounds</span>
            </div>
            {selectedBounds ? (
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-data-mono text-[11px] leading-5 text-on-surface">
                <span>Lng {selectedBounds.min_lng.toFixed(5)}</span>
                <span>{selectedBounds.max_lng.toFixed(5)}</span>
                <span>Lat {selectedBounds.min_lat.toFixed(5)}</span>
                <span>{selectedBounds.max_lat.toFixed(5)}</span>
              </div>
            ) : (
              <div className="font-body-sm text-body-sm text-on-surface-variant">未选择区域</div>
            )}
          </div>

          {simulationMessage ? (
            <div className="rounded-lg border border-tertiary/30 bg-tertiary-container px-3 py-2 text-body-sm font-body-sm text-on-tertiary-container">
              {simulationMessage}
            </div>
          ) : null}
          {simulationError ? (
            <div className="rounded-lg border border-error/30 bg-error-container px-3 py-2 text-body-sm font-body-sm text-on-error-container">
              {simulationError}
            </div>
          ) : null}
          {lastPersistResult ? (
            <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-3">
              <div className="mb-2 font-label-caps text-[10px] uppercase text-on-surface-variant">SQLite 写入结果</div>
              <div className="grid grid-cols-2 gap-2 font-data-mono text-[11px] leading-5 text-on-surface">
                <span>基站 {countText(lastPersistResult.after_counts?.base_stations)}</span>
                <span>指标 {countText(lastPersistResult.after_counts?.network_metrics)}</span>
                <span>故障 {countText(lastPersistResult.after_counts?.fault_logs)}</span>
                <span>诊断 {countText(lastPersistResult.after_counts?.diagnosis_records)}</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Bottom Legend Overlay ───────────────────────── */}
      <div className="absolute bottom-6 right-[360px] z-20 hidden rounded-xl border border-outline-variant bg-surface/95 p-4 shadow-lg backdrop-blur xl:block">
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
            <span className="font-body-sm text-body-sm text-on-surface">严重故障坐标</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#2a14b4]" />
            <span className="font-body-sm text-body-sm text-on-surface">AI入库故障坐标</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#2563eb]" />
            <span className="font-body-sm text-body-sm text-on-surface">一般故障坐标</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-outline-variant" />
            <span className="font-body-sm text-body-sm text-on-surface">离线 (Offline)</span>
          </div>
        </div>
      </div>

      {/* ── Right Info Panel ─────────────────────────────────── */}
      <aside
        data-testid="map-info-panel"
        className="absolute bottom-6 right-4 top-20 z-20 flex w-[min(320px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface/95 shadow-lg backdrop-blur animate-fade-in md:right-6"
      >
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

              <div className="flex flex-col gap-1">
                <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">Source</span>
                <span
                  className={[
                    'inline-flex w-fit items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold border',
                    isAiFault(selectedFault)
                      ? 'bg-primary/15 text-primary border-primary/30'
                      : 'bg-surface-container text-on-surface-variant border-outline-variant',
                  ].join(' ')}
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {isAiFault(selectedFault) ? 'psychology' : 'history'}
                  </span>
                  {faultSourceLabel(selectedFault)}
                </span>
              </div>

              {/* Station */}
              <div className="flex flex-col gap-1">
                <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">Station</span>
                <span className="font-data-mono text-data-mono text-on-surface">
                  {selectedFault.station_id || 'Unknown'}
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">Coordinate</span>
                <span className={hasFaultCoordinates(selectedFault) ? 'font-data-mono text-data-mono text-on-surface' : 'font-body-sm text-body-sm text-on-surface-variant'}>
                  {formatFaultCoordinate(selectedFault)}
                </span>
                {!hasFaultCoordinates(selectedFault) && (
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    该记录仍可查看诊断，但不会在地图上绘制定位点。
                  </span>
                )}
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
                  className="w-full py-2 bg-surface border border-outline-variant text-on-surface font-body-base rounded-lg hover:bg-surface-container-low transition-colors shadow-sm flex justify-center items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                  type="button"
                  onClick={() => navigate(`/stations/${selectedFault.station_id}`)}
                  disabled={!selectedFault.station_id}
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
                {faultStats.length > 0 ? faultStats.map((stat) => (
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
                )) : (
                  <p className="font-body-sm text-body-sm text-on-surface-variant">暂无故障统计数据</p>
                )}
              </div>
            </div>
          </>
        ) : (
          /* ── No fault selected placeholder ────────────────── */
          <div className="flex-1 flex flex-col p-6 gap-5 overflow-y-auto">
            {loadError && (
              <div className="rounded-lg border border-error/30 bg-error-container/40 p-3 text-body-sm font-body-sm text-on-error-container">
                {loadError}
              </div>
            )}
            <div className="flex flex-col items-center justify-center gap-3 text-center">
              <span className="material-symbols-outlined text-on-surface-variant text-[48px]">touch_app</span>
              <h3 className="font-headline-md text-headline-md text-on-surface-variant">点击地图标记查看故障详情</h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                有坐标的历史和AI入库故障会显示在地图上；缺少坐标的记录在下方列出。
              </p>
            </div>

            <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-on-surface-variant text-[18px]">location_off</span>
                  <h4 className="font-title-sm text-title-sm text-on-surface">无坐标故障</h4>
                </div>
                <span className="font-data-mono text-data-mono text-on-surface-variant">{unlocatedFaults.length}</span>
              </div>
              {unlocatedFaults.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {unlocatedFaults.slice(0, 8).map((fault) => (
                    <button
                      key={fault.fault_id}
                      type="button"
                      onClick={() => setSelectedFault(fault)}
                      className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-left transition-colors hover:bg-surface-container-low"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-body-sm text-body-sm font-semibold text-on-surface">
                          {fault.fault_type_cn ?? '未知故障'}
                        </span>
                        <span className={isAiFault(fault) ? 'text-primary' : 'text-on-surface-variant'}>
                          <span className="material-symbols-outlined text-[16px]">
                            {isAiFault(fault) ? 'psychology' : 'history'}
                          </span>
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 font-body-sm text-body-sm text-on-surface-variant">
                        <span className="truncate">{fault.station_id ?? '未知基站'}</span>
                        <span>{fault.fault_level ?? '未分级'}</span>
                      </div>
                    </button>
                  ))}
                  {unlocatedFaults.length > 8 && (
                    <p className="text-center font-body-sm text-body-sm text-on-surface-variant">
                      还有 {unlocatedFaults.length - 8} 条无坐标记录可在故障日志中查看。
                    </p>
                  )}
                </div>
              ) : (
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  当前故障记录均带有可绘制坐标。
                </p>
              )}
            </div>
          </div>
        )}
      </aside>

      {pendingGeneration ? (
        <div data-testid="map-generation-modal" className="absolute inset-0 z-40 flex items-center justify-center bg-scrim/35 px-4 backdrop-blur-sm">
          <section className="max-h-[86vh] w-full max-w-3xl overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-outline-variant bg-surface-container-lowest px-5 py-4">
              <div>
                <h2 className="font-headline-md text-headline-md text-on-surface">区域模拟数据预览</h2>
                <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
                  数据已生成到预览目录，尚未写入 SQLite。确认后才会刷新当前演示库。
                </p>
                <p className="mt-1 font-data-mono text-data-mono text-on-surface-variant">
                  批次 {pendingGeneration.preview_id ?? '--'}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant bg-surface text-on-surface hover:bg-surface-container-low"
                onClick={handleDiscardGeneratedData}
                disabled={persistingGeneratedData}
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="max-h-[calc(86vh-148px)] overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {Object.entries(pendingGeneration.generated_files).map(([key, value]) => (
                  <div key={key} className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-3">
                    <div className="font-label-caps text-[10px] uppercase text-on-surface-variant">{formatGeneratedFileLabel(key)}</div>
                    <div className="mt-1 font-data-mono text-[20px] font-bold leading-7 text-on-surface">{countText(value)}</div>
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
                    <dt className="text-on-surface-variant">定位增强</dt>
                    <dd className="font-data-mono text-on-surface">{pendingGeneration.parameters.enable_triangulation ? '开启' : '关闭'}</dd>
                  </dl>
                </div>

                <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4">
                  <h3 className="font-title-sm text-title-sm text-on-surface">故障类型分布</h3>
                  <div className="mt-3 flex flex-col gap-2">
                    {Object.entries(pendingGeneration.fault_type_counts).map(([type, count]) => (
                      <div key={type} className="flex items-center justify-between gap-3">
                        <span className="truncate font-body-sm text-body-sm text-on-surface">{type}</span>
                        <span className="font-data-mono text-data-mono text-on-surface-variant">{countText(count)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {pendingGeneration.parameters.area_bounds ? (
                <div className="mt-4 rounded-lg border border-outline-variant bg-surface-container-lowest p-4">
                  <h3 className="font-title-sm text-title-sm text-on-surface">地图框选区域</h3>
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 font-data-mono text-data-mono text-on-surface">
                    <span>Lng {pendingGeneration.parameters.area_bounds.min_lng.toFixed(6)}</span>
                    <span>{pendingGeneration.parameters.area_bounds.max_lng.toFixed(6)}</span>
                    <span>Lat {pendingGeneration.parameters.area_bounds.min_lat.toFixed(6)}</span>
                    <span>{pendingGeneration.parameters.area_bounds.max_lat.toFixed(6)}</span>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-2 border-t border-outline-variant bg-surface px-5 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-outline-variant bg-surface px-4 py-2 text-body-sm font-body-sm text-on-surface hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleDiscardGeneratedData}
                disabled={persistingGeneratedData}
              >
                取消写入
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-body-sm font-body-sm text-on-primary hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                onClick={handlePersistGeneratedData}
                disabled={persistingGeneratedData}
              >
                <span className={`material-symbols-outlined text-[18px] ${persistingGeneratedData ? 'animate-spin-slow' : ''}`}>
                  {persistingGeneratedData ? 'progress_activity' : 'database'}
                </span>
                {persistingGeneratedData ? '写入中' : '写入 SQLite 并刷新地图'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
