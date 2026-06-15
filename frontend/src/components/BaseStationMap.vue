<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import L from 'leaflet'
import type { Station } from '@/types/api'
import type { FaultLog } from '@/types/api'

const props = withDefaults(defineProps<{
  stations: Station[]
  faults?: FaultLog[]
}>(), {
  faults: () => [],
})

const mapRef = ref<HTMLDivElement>()
let map: L.Map | null = null

const statusColorMap: Record<string, string> = {
  '正常': '#22c55e',
  '预警': '#eab308',
  '严重': '#ef4444',
  '离线': '#94a3b8',
}

function getStationColor(status: string | null): string {
  if (!status) return '#94a3b8'
  return statusColorMap[status] || '#94a3b8'
}

function initMap() {
  if (!mapRef.value) return

  map = L.map(mapRef.value, {
    center: [39.9, 116.4],
    zoom: 11,
    zoomControl: true,
  })

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 18,
  }).addTo(map)

  addMarkers()
}

function addMarkers() {
  if (!map) return

  // Add station markers
  for (const station of props.stations) {
    if (station.latitude === null || station.longitude === null) continue

    const color = getStationColor(station.status)
    const radius = station.status === '严重' ? 10 : station.status === '预警' ? 8 : 6

    const marker = L.circleMarker([station.latitude, station.longitude], {
      radius,
      fillColor: color,
      color: color,
      weight: 2,
      opacity: 0.8,
      fillOpacity: 0.6,
    }).addTo(map)

    marker.bindPopup(`
      <div style="font-size:13px;min-width:140px">
        <div style="font-weight:600;margin-bottom:4px">${station.station_id}</div>
        <div>状态: <span style="color:${color};font-weight:500">${station.status ?? '未知'}</span></div>
        <div>经度: ${station.longitude?.toFixed(4)}</div>
        <div>纬度: ${station.latitude?.toFixed(4)}</div>
      </div>
    `)
  }

  // Add fault markers
  for (const fault of props.faults) {
    if (fault.fault_latitude === null || fault.fault_longitude === null) continue

    const faultIcon = L.divIcon({
      className: '',
      html: `<div style="
        width:20px;height:20px;
        background:#ef4444;
        border:2px solid #fff;
        border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        font-size:12px;font-weight:bold;color:#fff;
        box-shadow:0 1px 4px rgba(0,0,0,0.3);
      ">!</div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    })

    const marker = L.marker([fault.fault_latitude, fault.fault_longitude], { icon: faultIcon }).addTo(map)

    marker.bindPopup(`
      <div style="font-size:13px;min-width:160px">
        <div style="font-weight:600;margin-bottom:4px">${fault.fault_id}</div>
        <div>类型: <span style="font-weight:500">${fault.fault_type_cn ?? '--'}</span></div>
        <div>严重程度: ${fault.fault_level ?? '--'}</div>
        <div>基站: ${fault.station_id ?? '--'}</div>
        <div>置信度: ${fault.confidence !== null ? (fault.confidence * 100).toFixed(1) + '%' : '--'}</div>
      </div>
    `)
  }
}

onMounted(() => {
  initMap()
})

onUnmounted(() => {
  if (map) {
    map.remove()
    map = null
  }
})

watch(
  () => [props.stations, props.faults],
  () => {
    if (map) {
      // Clear existing markers and re-add
      map.eachLayer(layer => {
        if (layer instanceof L.CircleMarker || layer instanceof L.Marker) {
          map!.removeLayer(layer)
        }
      })
      addMarkers()
    }
  },
  { deep: true },
)

defineExpose({ map })
</script>

<template>
  <div ref="mapRef" class="w-full h-[400px] rounded-[0.5rem]" />
</template>

<style>
@import 'leaflet/dist/leaflet.css';
</style>
