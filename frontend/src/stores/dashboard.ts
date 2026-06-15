import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { DashboardSummary } from '../types/api'
import { fetchDashboardSummary } from '../api/dashboard'

export const useDashboardStore = defineStore('dashboard', () => {
  const summary = ref<DashboardSummary | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function loadSummary() {
    loading.value = true
    error.value = null
    try {
      summary.value = await fetchDashboardSummary()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '加载监控总览失败'
      error.value = message
    } finally {
      loading.value = false
    }
  }

  function reset() {
    summary.value = null
    loading.value = false
    error.value = null
  }

  return { summary, loading, error, loadSummary, reset }
})
