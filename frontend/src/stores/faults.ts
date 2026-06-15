import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { FaultLog, FaultDetail, FaultFilters, DetectResult, ClassifyResult } from '../types/api'
import { fetchFaults, fetchFaultDetail, detectFaults, classifyFaults } from '../api/faults'

export const useFaultsStore = defineStore('faults', () => {
  const faults = ref<FaultLog[]>([])
  const currentFault = ref<FaultDetail | null>(null)
  const filters = ref<FaultFilters>({})
  const loading = ref(false)
  const error = ref<string | null>(null)
  const detectResult = ref<DetectResult | null>(null)
  const classifyResult = ref<ClassifyResult | null>(null)

  async function loadFaults(newFilters?: FaultFilters, limit: number = 200) {
    loading.value = true
    error.value = null
    if (newFilters) {
      filters.value = newFilters
    }
    try {
      faults.value = await fetchFaults(filters.value, limit)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '加载故障日志失败'
      error.value = message
    } finally {
      loading.value = false
    }
  }

  async function loadFaultDetail(faultId: string) {
    loading.value = true
    error.value = null
    try {
      currentFault.value = await fetchFaultDetail(faultId)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '加载故障详情失败'
      error.value = message
    } finally {
      loading.value = false
    }
  }

  async function runDetect() {
    loading.value = true
    error.value = null
    try {
      detectResult.value = await detectFaults()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '异常检测执行失败'
      error.value = message
    } finally {
      loading.value = false
    }
  }

  async function runClassify() {
    loading.value = true
    error.value = null
    try {
      classifyResult.value = await classifyFaults()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '故障分类执行失败'
      error.value = message
    } finally {
      loading.value = false
    }
  }

  function setFilters(newFilters: FaultFilters) {
    filters.value = newFilters
  }

  function resetFilters() {
    filters.value = {}
  }

  function reset() {
    faults.value = []
    currentFault.value = null
    filters.value = {}
    loading.value = false
    error.value = null
    detectResult.value = null
    classifyResult.value = null
  }

  return {
    faults,
    currentFault,
    filters,
    loading,
    error,
    detectResult,
    classifyResult,
    loadFaults,
    loadFaultDetail,
    runDetect,
    runClassify,
    setFilters,
    resetFilters,
    reset,
  }
})
