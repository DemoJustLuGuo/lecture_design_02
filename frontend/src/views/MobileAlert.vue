<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useFaultsStore } from '../stores/faults'
import { fetchFaultDetail } from '../api/faults'
import StatusBadge from '../components/StatusBadge.vue'
import type { FaultDetail } from '../types/api'

/* ------------------------------------------------------------------ */
/*  Store & local state                                                */
/* ------------------------------------------------------------------ */
const faultsStore = useFaultsStore()
const expandedId = ref<string | null>(null)
const diagnosisMap = ref<Record<string, FaultDetail>>({})
const diagnosisLoading = ref<Record<string, boolean>>({})

/* ------------------------------------------------------------------ */
/*  Severity ordering for sort                                         */
/* ------------------------------------------------------------------ */
function severityOrder(level: string | null): number {
  switch (level) {
    case '严重': return 0
    case '预警': return 1
    case '一般': return 2
    default:     return 3
  }
}

/* ------------------------------------------------------------------ */
/*  Sorted faults — severe first                                       */
/* ------------------------------------------------------------------ */
const sortedFaults = computed(() => {
  const list = [...faultsStore.faults]
  // Filter out null-level items that aren't faults
  return list
    .filter(f => f.fault_type_cn != null || f.fault_level != null)
    .sort((a, b) => severityOrder(a.fault_level) - severityOrder(b.fault_level))
})

/* ------------------------------------------------------------------ */
/*  Severe fault count                                                 */
/* ------------------------------------------------------------------ */
const severeCount = computed(() =>
  faultsStore.faults.filter(f => f.fault_level === '严重').length
)

/* ------------------------------------------------------------------ */
/*  Fault type color mapping                                           */
/* ------------------------------------------------------------------ */
const faultTypeColors: Record<string, { bg: string; text: string; border: string }> = {
  '信道干扰': { bg: '#fef3c7', text: '#d97706', border: '#fcd34d' },
  '基站故障': { bg: '#fef2f2', text: '#ef4444', border: '#fca5a5' },
  '带宽不足': { bg: '#eff6ff', text: '#3b82f6', border: '#bfdbfe' },
  '误码过高': { bg: '#fce7f3', text: '#ec4899', border: '#f9a8d4' },
  '信号中断': { bg: '#f1f5f9', text: '#64748b', border: '#cbd5e1' },
}

function getFaultTypeStyle(typeCn: string | null) {
  if (!typeCn) return { bg: '#f1f5f9', text: '#94a3b8', border: '#e2e8f0' }
  return faultTypeColors[typeCn] ?? { bg: '#f1f5f9', text: '#94a3b8', border: '#e2e8f0' }
}

/* ------------------------------------------------------------------ */
/*  Format time                                                        */
/* ------------------------------------------------------------------ */
function formatTime(dateStr: string | null): string {
  if (!dateStr) return '--'
  try {
    const d = new Date(dateStr)
    return d.toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  } catch {
    return dateStr
  }
}

/* ------------------------------------------------------------------ */
/*  Expand / collapse a card                                           */
/* ------------------------------------------------------------------ */
async function toggleExpand(faultId: string) {
  if (expandedId.value === faultId) {
    expandedId.value = null
    return
  }
  expandedId.value = faultId

  // Load diagnosis detail if not already loaded
  if (!diagnosisMap.value[faultId]) {
    diagnosisLoading.value[faultId] = true
    try {
      const detail = await fetchFaultDetail(faultId)
      diagnosisMap.value[faultId] = detail
    } catch {
      // Silently fail — the card will just not show diagnosis
    } finally {
      diagnosisLoading.value[faultId] = false
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Extract diagnosis info from FaultDetail                             */
/* ------------------------------------------------------------------ */
function getDiagnosis(faultId: string): FaultDetail | null {
  return diagnosisMap.value[faultId] ?? null
}

function extractRootCause(detail: FaultDetail | null): string {
  if (!detail?.diagnosis_text) return ''
  // Try to parse structured diagnosis_text
  // It could be a plain string or JSON
  try {
    const parsed = JSON.parse(detail.diagnosis_text)
    return parsed.root_cause ?? parsed.reason ?? ''
  } catch {
    // Plain text — return it as-is
    return detail.diagnosis_text
  }
}

function extractActions(detail: FaultDetail | null): string[] {
  if (!detail?.diagnosis_text) return []
  try {
    const parsed = JSON.parse(detail.diagnosis_text)
    const actions = parsed.suggested_actions ?? parsed.actions ?? []
    if (typeof actions === 'string') return actions.split(';').map(s => s.trim()).filter(Boolean)
    if (Array.isArray(actions)) return actions.map(String)
    return []
  } catch {
    return []
  }
}

/* ------------------------------------------------------------------ */
/*  Quick suggestion based on fault type                               */
/* ------------------------------------------------------------------ */
const quickSuggestions: Record<string, string> = {
  '信道干扰': '建议检查相邻基站频率配置，调整信道分配',
  '基站故障': '建议排查基站硬件状态，检查电源和板卡',
  '带宽不足': '建议评估当前负载，考虑扩容或负载均衡',
  '误码过高': '建议检查传输链路质量，排查干扰源',
  '信号中断': '建议检查天线和射频模块，确认覆盖范围',
}

function getQuickSuggestion(typeCn: string | null): string {
  if (!typeCn) return ''
  return quickSuggestions[typeCn] ?? ''
}

/* ------------------------------------------------------------------ */
/*  Data loading                                                       */
/* ------------------------------------------------------------------ */
onMounted(() => {
  if (faultsStore.faults.length === 0) {
    faultsStore.loadFaults()
  }
})

function retryLoad() {
  faultsStore.loadFaults()
}
</script>

<template>
  <div class="max-w-[480px] mx-auto min-h-screen bg-slate-50">
    <!-- Top header bar -->
    <div class="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-[16px] font-semibold text-slate-800">移动预警</div>
          <div class="text-[12px] text-slate-500">通信故障实时告警</div>
        </div>
        <button
          @click="retryLoad()"
          class="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors"
          title="刷新"
        >
          <svg class="w-4 h-4 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6" />
            <path d="M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
            <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Severe fault alert banner -->
    <div
      v-if="!faultsStore.loading && !faultsStore.error && severeCount > 0"
      class="mx-4 mt-4 rounded-xl bg-gradient-to-r from-red-600 to-red-500 px-5 py-4 text-white shadow-md"
    >
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
          <svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <path d="M12 9 L12 13" />
            <path d="M12 17 L12.01 17" />
          </svg>
        </div>
        <div>
          <div class="text-[20px] font-bold leading-none">{{ severeCount }}</div>
          <div class="text-[12px] mt-1 opacity-90">个严重故障需要立即处理</div>
        </div>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="faultsStore.loading" class="flex items-center justify-center py-20">
      <div class="flex flex-col items-center gap-3">
        <div class="w-8 h-8 border-2 border-[#4338ca] border-t-transparent rounded-full animate-spin"></div>
        <span class="text-sm text-slate-500">正在加载故障数据...</span>
      </div>
    </div>

    <!-- Error state -->
    <div v-else-if="faultsStore.error" class="flex items-center justify-center py-20">
      <div class="bg-white rounded-xl p-8 shadow-sm border border-slate-100 text-center max-w-sm">
        <div class="w-12 h-12 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center">
          <svg class="w-6 h-6 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8 L12 12" />
            <path d="M12 16 L12.01 16" />
          </svg>
        </div>
        <h3 class="text-base font-semibold text-slate-800 mb-2">加载失败</h3>
        <p class="text-sm text-slate-500 mb-4">{{ faultsStore.error }}</p>
        <button
          @click="retryLoad()"
          class="px-4 py-2 rounded-lg bg-[#4338ca] text-white text-sm font-medium hover:bg-[#3730a3] transition-colors"
        >
          重新加载
        </button>
      </div>
    </div>

    <!-- Fault card list -->
    <div v-else-if="sortedFaults.length > 0" class="px-4 pb-6 space-y-3 mt-4">
      <div
        v-for="fault in sortedFaults"
        :key="fault.fault_id"
        class="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden transition-all"
      >
        <!-- Card header — always visible -->
        <div
          class="px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
          @click="toggleExpand(fault.fault_id)"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <!-- Fault type badge -->
              <span
                class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold leading-tight"
                :style="{
                  backgroundColor: getFaultTypeStyle(fault.fault_type_cn).bg,
                  color: getFaultTypeStyle(fault.fault_type_cn).text,
                  borderColor: getFaultTypeStyle(fault.fault_type_cn).border,
                  borderWidth: '1px',
                  borderStyle: 'solid',
                }"
              >
                {{ fault.fault_type_cn ?? '未知' }}
              </span>
              <!-- Severity badge -->
              <StatusBadge :status="(fault.fault_level as any) ?? '未处理'" />
            </div>
            <!-- Expand/collapse indicator -->
            <svg
              class="w-4 h-4 text-slate-400 transition-transform"
              :class="expandedId === fault.fault_id ? 'rotate-180' : ''"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>

          <div class="mt-2 flex items-center gap-4 text-[13px]">
            <!-- Station ID -->
            <div class="flex items-center gap-1.5 text-slate-600">
              <svg class="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4.976 9.828a6 6 0 0 1 14.048 0" />
                <path d="M2.146 6.146a10 10 0 0 1 19.708 0" />
                <path d="M12 18 L12 22" />
                <path d="M8 22 L16 22" />
              </svg>
              <span>{{ fault.station_id ?? '未知基站' }}</span>
            </div>
            <!-- Detection time -->
            <div class="flex items-center gap-1.5 text-slate-400">
              <svg class="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>{{ formatTime(fault.detected_at) }}</span>
            </div>
          </div>

          <!-- Quick suggestion (if available) -->
          <div v-if="getQuickSuggestion(fault.fault_type_cn)" class="mt-2 text-[12px] text-slate-500">
            {{ getQuickSuggestion(fault.fault_type_cn) }}
          </div>
        </div>

        <!-- Expanded detail section -->
        <div
          v-if="expandedId === fault.fault_id"
          class="px-4 pb-4 border-t border-slate-100"
        >
          <!-- Loading diagnosis -->
          <div v-if="diagnosisLoading[fault.fault_id]" class="flex items-center justify-center py-6">
            <div class="w-6 h-6 border-2 border-[#4338ca] border-t-transparent rounded-full animate-spin"></div>
            <span class="ml-2 text-sm text-slate-500">加载诊断详情...</span>
          </div>

          <!-- Diagnosis content -->
          <template v-else-if="getDiagnosis(fault.fault_id)">
            <div class="mt-3 space-y-3">
              <!-- Root cause -->
              <div v-if="extractRootCause(getDiagnosis(fault.fault_id))" class="bg-amber-50 rounded-lg p-3 border border-amber-200">
                <div class="text-[12px] font-semibold text-amber-700 mb-1">原因分析</div>
                <div class="text-[13px] text-amber-800 leading-relaxed">
                  {{ extractRootCause(getDiagnosis(fault.fault_id)) }}
                </div>
              </div>

              <!-- Suggested actions -->
              <div v-if="extractActions(getDiagnosis(fault.fault_id)).length > 0" class="bg-green-50 rounded-lg p-3 border border-green-200">
                <div class="text-[12px] font-semibold text-green-700 mb-1">处理建议</div>
                <ul class="space-y-1">
                  <li
                    v-for="(action, idx) in extractActions(getDiagnosis(fault.fault_id))"
                    :key="idx"
                    class="text-[13px] text-green-800 flex items-start gap-1.5"
                  >
                    <span class="text-green-600 mt-0.5">{{ idx + 1 }}.</span>
                    <span>{{ action }}</span>
                  </li>
                </ul>
              </div>

              <!-- If diagnosis_text is plain text (not structured) -->
              <div
                v-if="
                  getDiagnosis(fault.fault_id)?.diagnosis_text &&
                  !extractRootCause(getDiagnosis(fault.fault_id)) &&
                  !extractActions(getDiagnosis(fault.fault_id)).length
                "
                class="bg-blue-50 rounded-lg p-3 border border-blue-200"
              >
                <div class="text-[12px] font-semibold text-blue-700 mb-1">诊断建议</div>
                <div class="text-[13px] text-blue-800 leading-relaxed">
                  {{ getDiagnosis(fault.fault_id)!.diagnosis_text }}
                </div>
              </div>

              <!-- Additional KPI info -->
              <div v-if="getDiagnosis(fault.fault_id)?.affected_kpis" class="bg-slate-50 rounded-lg p-3 border border-slate-200">
                <div class="text-[12px] font-semibold text-slate-600 mb-1">受影响指标</div>
                <div class="text-[13px] text-slate-700">{{ getDiagnosis(fault.fault_id)!.affected_kpis }}</div>
              </div>

              <!-- Confidence -->
              <div v-if="fault.confidence != null" class="text-[12px] text-slate-500 flex items-center gap-2">
                <span>置信度: {{ (fault.confidence * 100).toFixed(1) }}%</span>
                <span v-if="fault.localization_error_m != null">· 定位误差: {{ fault.localization_error_m.toFixed(1) }}m</span>
              </div>
            </div>
          </template>

          <!-- No diagnosis available -->
          <template v-else>
            <div class="mt-3 text-center py-4 text-[13px] text-slate-400">
              暂无诊断建议
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="flex items-center justify-center py-20">
      <div class="bg-white rounded-xl p-8 shadow-sm border border-slate-100 text-center max-w-sm">
        <div class="w-12 h-12 mx-auto mb-4 rounded-full bg-green-50 flex items-center justify-center">
          <svg class="w-6 h-6 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>
        <h3 class="text-base font-semibold text-slate-800 mb-2">当前无故障告警</h3>
        <p class="text-sm text-slate-500 mb-4">所有基站运行正常</p>
      </div>
    </div>
  </div>
</template>
