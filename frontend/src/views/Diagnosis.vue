<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { fetchDiagnosis } from '../api/diagnosis'
import StatusBadge from '../components/StatusBadge.vue'
import type { DiagnosisRecord } from '../types/api'

const route = useRoute()
const faultId = route.params.id as string

const loading = ref(true)
const error = ref<string | null>(null)
const data = ref<DiagnosisRecord | null>(null)

const fault = computed(() => data.value?.fault ?? null)
const diagnosis = computed(() => data.value ?? null)

/* ------------------------------------------------------------------ */
/*  Parse suggested_actions into a list of strings                    */
/* ------------------------------------------------------------------ */
const actionList = computed(() => {
  const raw = diagnosis.value?.suggested_actions
  if (!raw) return []

  // Try JSON array first
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.map((s: unknown) => String(s).trim())
  } catch {
    // not JSON, continue
  }

  // Try newline split (common for numbered / bulleted lists)
  const lines = raw.split(/\n/).map(s => s.trim()).filter(Boolean)
  if (lines.length > 1) {
    return lines.map(l => l.replace(/^[\d]+[\.\)、]\s*/, '').replace(/^[-*]\s*/, '').trim())
  }

  // Try semicolon / Chinese semicolon split
  const parts = raw.split(/[;；]/).map(s => s.trim()).filter(Boolean)
  if (parts.length > 1) return parts

  // Single item
  return [raw.trim()]
})

/* ------------------------------------------------------------------ */
/*  Confidence display helper                                         */
/* ------------------------------------------------------------------ */
const confidencePercent = computed(() => {
  if (fault.value?.confidence == null) return '--'
  return `${(fault.value.confidence * 100).toFixed(1)}%`
})

/* ------------------------------------------------------------------ */
/*  Fault level -> StatusBadge prop                                   */
/* ------------------------------------------------------------------ */
const levelBadgeStatus = computed(() => {
  const level = fault.value?.fault_level
  if (!level) return '离线'
  if (level === '严重' || level === 'severe' || level === '高' || level === 'high') return '严重'
  if (level === '中' || level === 'medium') return '预警'
  if (level === '低' || level === 'low') return '正常'
  return '需复核'
})

const levelDisplay = computed(() => fault.value?.fault_level ?? '--')

/* ------------------------------------------------------------------ */
/*  review_required: number -> boolean (1 = true)                     */
/* ------------------------------------------------------------------ */
const needsReview = computed(() => diagnosis.value?.review_required === 1)

/* ------------------------------------------------------------------ */
/*  Data loading                                                      */
/* ------------------------------------------------------------------ */
async function loadData() {
  loading.value = true
  error.value = null
  try {
    const result = await fetchDiagnosis(faultId)
    data.value = result
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '加载诊断数据失败'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadData()
})
</script>

<template>
  <div class="space-y-6">
    <!-- Loading state -->
    <div v-if="loading" class="flex items-center justify-center py-20">
      <div class="flex flex-col items-center gap-3">
        <div class="w-8 h-8 border-2 border-[#4338ca] border-t-transparent rounded-full animate-spin"></div>
        <span class="text-sm text-slate-500">正在加载诊断数据...</span>
      </div>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="flex items-center justify-center py-20">
      <div class="bg-white rounded-[0.5rem] border border-[#E2E8F0] p-[20px] text-center max-w-md">
        <div class="w-12 h-12 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center">
          <svg class="w-6 h-6 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8 L12 12" />
            <path d="M12 16 L12.01 16" />
          </svg>
        </div>
        <h3 class="text-base font-semibold text-slate-800 mb-2">加载失败</h3>
        <p class="text-sm text-slate-500 mb-4">{{ error }}</p>
        <button
          @click="loadData()"
          class="px-4 py-2 rounded-lg bg-[#4338ca] text-white text-sm font-medium hover:bg-[#3730a3] transition-colors"
        >
          重新加载
        </button>
      </div>
    </div>

    <!-- Data loaded -->
    <template v-else-if="data">
      <!-- Page header -->
      <div>
        <div class="text-[15px] font-semibold text-slate-800">诊断建议</div>
        <div class="text-[13px] text-slate-500 mt-1">故障 ID: {{ faultId }}</div>
      </div>

      <!-- Top: Fault basic info card -->
      <div class="bg-white rounded-[0.5rem] border border-[#E2E8F0] p-[20px]">
        <h3 class="text-[15px] font-semibold text-slate-800 mb-4">故障基本信息</h3>
        <div class="grid grid-cols-3 gap-x-6 gap-y-3">
          <div class="flex items-center gap-2">
            <span class="text-[12px] text-slate-500 w-[72px] shrink-0">故障 ID</span>
            <span class="text-[13px] text-slate-800 font-medium">{{ fault?.fault_id ?? '--' }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[12px] text-slate-500 w-[72px] shrink-0">检测时间</span>
            <span class="text-[13px] text-slate-800">{{ fault?.detected_at ?? '--' }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[12px] text-slate-500 w-[72px] shrink-0">基站 ID</span>
            <span class="text-[13px] text-slate-800 font-medium">{{ fault?.station_id ?? '--' }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[12px] text-slate-500 w-[72px] shrink-0">故障类型</span>
            <span class="text-[13px] text-slate-800 font-medium">{{ fault?.fault_type_cn ?? '--' }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[12px] text-slate-500 w-[72px] shrink-0">故障等级</span>
            <StatusBadge :status="levelBadgeStatus" />
            <span class="text-[13px] text-slate-700">{{ levelDisplay }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[12px] text-slate-500 w-[72px] shrink-0">置信度</span>
            <span class="text-[13px] text-slate-800 font-medium">{{ confidencePercent }}</span>
          </div>
        </div>
      </div>

      <!-- Card 1: Root cause analysis -->
      <div class="bg-white rounded-[0.5rem] border border-[#E2E8F0] p-[20px]">
        <h3
          class="text-[15px] font-semibold mb-3 px-3 py-2 rounded-md bg-slate-800 text-white"
        >
          原因分析
        </h3>
        <div class="text-[13px] text-slate-700 leading-relaxed bg-slate-50 rounded-md px-4 py-3">
          {{ diagnosis?.root_cause ?? '暂无原因分析数据' }}
        </div>
      </div>

      <!-- Card 2: Suggested actions -->
      <div class="bg-white rounded-[0.5rem] border border-[#E2E8F0] p-[20px]">
        <h3
          class="text-[15px] font-semibold mb-3 px-3 py-2 rounded-md bg-slate-800 text-white"
        >
          处理建议
        </h3>
        <div v-if="actionList.length > 0" class="space-y-2">
          <div
            v-for="(action, index) in actionList"
            :key="index"
            class="flex items-start gap-3 text-[13px] bg-slate-50 rounded-md px-4 py-3"
          >
            <span
              class="shrink-0 w-5 h-5 rounded-full bg-[#4338ca] text-white text-[11px] font-semibold flex items-center justify-center"
            >
              {{ index + 1 }}
            </span>
            <span class="text-slate-700 leading-relaxed">{{ action }}</span>
          </div>
        </div>
        <div v-else class="text-[13px] text-slate-400 bg-slate-50 rounded-md px-4 py-3">
          暂无处理建议数据
        </div>
      </div>

      <!-- Card 3: Affected scope -->
      <div class="bg-white rounded-[0.5rem] border border-[#E2E8F0] p-[20px]">
        <h3
          class="text-[15px] font-semibold mb-3 px-3 py-2 rounded-md bg-slate-800 text-white"
        >
          影响范围
        </h3>
        <div class="text-[13px] text-slate-700 leading-relaxed bg-slate-50 rounded-md px-4 py-3">
          {{ diagnosis?.affected_scope ?? '暂无影响范围数据' }}
        </div>
      </div>

      <!-- Bottom: Review required badge -->
      <div v-if="needsReview" class="bg-white rounded-[0.5rem] border border-[#E2E8F0] p-[20px]">
        <div class="flex items-center gap-3">
          <div class="relative flex items-center justify-center">
            <!-- Pulse animation ring -->
            <span
              class="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping"
            ></span>
            <span
              class="relative inline-flex items-center rounded-full bg-red-500 px-4 py-2 text-white text-[14px] font-semibold shadow-sm"
            >
              需人工复核
            </span>
          </div>
          <span class="text-[13px] text-slate-600">系统诊断结果标记为需要运维人员复核，请及时确认处理方案。</span>
        </div>
      </div>

      <div v-else class="bg-white rounded-[0.5rem] border border-[#E2E8F0] p-[20px]">
        <div class="flex items-center gap-2">
          <span
            class="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-green-700 text-[13px] font-medium"
          >
            自动诊断完成
          </span>
          <span class="text-[13px] text-slate-500">该故障诊断结果无需人工复核。</span>
        </div>
      </div>
    </template>

    <!-- Empty state (no data but not loading / error) -->
    <template v-else>
      <div class="flex items-center justify-center py-20">
        <div class="bg-white rounded-[0.5rem] border border-[#E2E8F0] p-[20px] text-center max-w-md">
          <div class="w-12 h-12 mx-auto mb-4 rounded-full bg-slate-50 flex items-center justify-center">
            <svg class="w-6 h-6 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9 L21 9" />
            </svg>
          </div>
          <h3 class="text-base font-semibold text-slate-800 mb-2">暂无诊断数据</h3>
          <p class="text-sm text-slate-500 mb-4">该故障尚未生成诊断建议</p>
          <button
            @click="loadData()"
            class="px-4 py-2 rounded-lg bg-[#4338ca] text-white text-sm font-medium hover:bg-[#3730a3] transition-colors"
          >
            重新加载
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
