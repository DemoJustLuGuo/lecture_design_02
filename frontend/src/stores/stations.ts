import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Station, StationDetail } from '../types/api'
import { fetchStations, fetchStationDetail } from '../api/stations'

export const useStationsStore = defineStore('stations', () => {
  const stations = ref<Station[]>([])
  const currentStation = ref<StationDetail | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function loadStations(limit: number = 200) {
    loading.value = true
    error.value = null
    try {
      stations.value = await fetchStations(limit)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '加载基站列表失败'
      error.value = message
    } finally {
      loading.value = false
    }
  }

  async function loadStationDetail(stationId: string) {
    loading.value = true
    error.value = null
    try {
      currentStation.value = await fetchStationDetail(stationId)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '加载基站详情失败'
      error.value = message
    } finally {
      loading.value = false
    }
  }

  function reset() {
    stations.value = []
    currentStation.value = null
    loading.value = false
    error.value = null
  }

  return { stations, currentStation, loading, error, loadStations, loadStationDetail, reset }
})
