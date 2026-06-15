<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useStationsStore } from '../stores/stations'
import { useFaultsStore } from '../stores/faults'
import BaseStationMap from '../components/BaseStationMap.vue'
import MetricCard from '../components/MetricCard.vue'
import StatusBadge from '../components/StatusBadge.vue'
import type { FaultLog } from '../types/api'

const router = useRouter()
const stationsStore = useStationsStore()
const faultsStore = useFaultsStore()

const selectedFault = ref<FaultLog | null>(null)

/* ------------------------------------------------------------------ */
/*  Loading & error states (combined from both stores)                */
/* ------------------------------------------------------------------ */
const isLoading = computed(() => stationsStore.loading || faultsStore.loading)
const hasError = computed(() => stationsStore.error || faultsStore.error)
const errorMessage = computed(() => stationsStore.error || faultsStore.error || '加载失败')

/* ------------------------------------------------------------------ */
/*  Fault type statistics                                             */
/* ------------------------------------------------------------------ */
const faultTypeStats = computed(() => {
  const counts: Record<string, number> = {}
  for (const f of faultsStore.faults) {
    const type = f.fault_type_cn ?? '未知'
    counts[type] = (counts[type] || 0) + 1
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({ type, count }))
})

/* ------------------------------------------------------------------ */
/*  Selected fault helpers                                            */
/* ------------------------------------------------------------------ */
const selectedConfidence = computed(() => {
  if (selectedFault.value?.confidence == null) return '--'
  return `${(selectedFault.value.confidence * 100).toFixed(1)}%`
})

const selectedLocError = computed(() => {
  if (selectedFault.value?.localization_error_m == null) return '--'
  return `${selectedFault.value.localization_error_m.toFixed(1)} m`
})

const selectedLevelBadge = computed(() => {
  const level = selectedFault.value?.fault_level
  if (!level) return '离线'
  if (level === '严重' || level === 'severe' || level === '高' || level === 'high') return '严重'
  if (level === '一般') return '一般'
  if (level === '中' || level === 'medium') return '预警'
  if (level === '低' || level === 'low') return '正常'
  return '需复核'
})

function levelBadgeStatus(level: string | null): string {
  if (!level) return '离线'
  if (level === '严重' || level === '高' || level === 'high' || level === 'severe') return '严重'
  if (level === '一般') return '一般'
  if (level === '预警' || level === '中' || level === 'medium') return '预警'
  if (level === '正常' || level === '低' || level === 'low') return '正常'
  return '需复核'
}

/* ------------------------------------------------------------------ */
/*  Actions                                                           */
/* ------------------------------------------------------------------ */
function selectFault(fault: FaultLog) {
  selectedFault.value = fault
}

function goToDiagnosis(faultId: string) {
  router.push({ name: 'diagnosis', params: { id: faultId } })
}

function retryLoad() {
  stationsStore.loadStations()
  faultsStore.loadFaults()
}

/* ------------------------------------------------------------------ */
/*  Data loading                                                      */
/* ------------------------------------------------------------------ */
onMounted(() => {
  stationsStore.loadStations()
  faultsStore.loadFaults()
})
</script>

<template>
  <div class="space-y-6">
    <!-- Loading state -->
    <div v-if="isLoading" class="flex items-center justify-center py-20">
      <div class="flex flex-col items-center gap-3">
        <div class="w-8 h-8 border-2 border-[#4338ca] border-t-transparent rounded-full animate-spin"></div>
        <span class="text-sm text-slate-500">正在加载地图数据...</span>
      </div>
    </div>

    <!-- Error state -->
    <div v-else-if="hasError" class="flex items-center justify-center py-20">
      <div class="bg-white rounded-[0.5rem] border border-[#E2E8F0] p-[20px] text-center max-w-md">
        <div class="w-12 h-12 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center">
          <svg class="w-6 h-6 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8 L12 12" />
            <path d="M12 16 L12.01 16" />
          </svg>
        </div>
        <h3 class="text-base font-semibold text-slate-800 mb-2">加载失败</h3>
        <p class="text-sm text-slate-500 mb-4">{{ errorMessage }}</p>
        <button
          @click="retryLoad()"
          class="px-4 py-2 rounded-lg bg-[#4338ca] text-white text-sm font-medium hover:bg-[#3730a3] transition-colors"
        >
          重新加载
        </button>
      </div>
    </div>

    <!-- Data loaded -->
    <template v-else>
      <!-- Page header -->
      <div>
        <div class="text-[15px] font-semibold text-slate-800">故障地图</div>
        <div class="text-[13px] text-slate-500 mt-1">
          在地图上展示基站分布与故障位置，共 {{ stationsStore.stations.length }} 个基站、{{ faultsStore.faults.length }} 条故障
        </div>
      </div>

      <!-- Main layout: map + sidebar -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <!-- Map area (2/3 width) -->
        <div class="lg:col-span-2 bg-white rounded-[0.5rem] border border-[#E2E8F0] p-[20px]">
          <h3 class="text-[15px] font-semibold text-slate-800 mb-4">基站与故障分布</h3>
          <BaseStationMap
            :stations="stationsStore.stations"
            :faults="faultsStore.faults"
          />
        </div>

        <!-- Sidebar (1/3 width) -->
        <div class="space-y-4">
          <!-- Selected fault info panel -->
          <div class="bg-white rounded-[0.5rem] border border-[#E2E8F0] p-[20px]">
            <h3 class="text-[15px] font-semibold text-slate-800 mb-4">故障详情</h3>
            <template v-if="selectedFault">
              <div class="space-y-3">
                <div class="flex items-center gap-2">
                  <span class="text-[12px] text-slate-500 w-[72px] shrink-0">故障 ID</span>
                  <span class="text-[13px] text-slate-800 font-medium">{{ selectedFault.fault_id }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-[12px] text-slate-500 w-[72px] shrink-0">故障类型</span>
                  <span class="text-[13px] text-slate-800 font-medium">{{ selectedFault.fault_type_cn ?? '--' }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-[12px] text-slate-500 w-[72px] shrink-0">基站 ID</span>
                  <span class="text-[13px] text-slate-800">{{ selectedFault.station_id ?? '--' }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-[12px] text-slate-500 w-[72px] shrink-0">故障等级</span>
                  <StatusBadge :status="selectedLevelBadge" />
                  <span class="text-[13px] text-slate-700">{{ selectedFault.fault_level ?? '--' }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-[12px] text-slate-500 w-[72px] shrink-0">置信度</span>
                  <span class="text-[13px] text-slate-800 font-medium">{{ selectedConfidence }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-[12px] text-slate-500 w-[72px] shrink-0">定位误差</span>
                  <span class="text-[13px] text-slate-800">{{ selectedLocError }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-[12px] text-slate-500 w-[72px] shrink-0">检测时间</span>
                  <span class="text-[13px] text-slate-800">{{ selectedFault.detected_at ?? '--' }}</span>
                </div>
                <div class="pt-2">
                  <button
                    @click="goToDiagnosis(selectedFault.fault_id)"
                    class="w-full px-4 py-2 rounded-lg bg-[#4338ca] text-white text-[13px] font-medium hover:bg-[#3730a3] transition-colors text-center"
                  >
                    查看诊断建议
                  </button>
                </div>
              </div>
            </template>
            <div v-else class="text-[13px] text-slate-400 text-center py-6">
              请在下方列表中点击选择一条故障
            </div>
          </div>

          <!-- Fault type stats cards -->
          <div class="bg-white rounded-[0.5rem] border border-[#E2E8F0] p-[20px]">
            <h3 class="text-[15px] font-semibold text-slate-800 mb-4">故障类型统计</h3>
            <div v-if="faultTypeStats.length > 0" class="grid grid-cols-2 gap-3">
              <MetricCard
                v-for="stat in faultTypeStats"
                :key="stat.type"
                :title="stat.type"
                :value="stat.count"
                color="indigo"
              />
            </div>
            <div v-else class="text-[13px] text-slate-400 text-center py-4">
              暂无故障数据
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom: Fault selection list -->
      <div class="bg-white rounded-[0.5rem] border border-[#E2E8F0] p-[20px]">
        <h3 class="text-[15px] font-semibold text-slate-800 mb-4">故障列表（点击查看详情）</h3>

        <div v-if="faultsStore.faults.length === 0" class="text-[13px] text-slate-400 text-center py-8">
          当前无故障记录
        </div>

        <div v-else class="overflow-x-auto">
          <table class="w-full text-[13px]">
            <thead>
              <tr class="border-b border-slate-200 text-slate-500">
                <th class="py-2 px-3 text-left font-medium">故障 ID</th>
                <th class="py-2 px-3 text-left font-medium">类型</th>
                <th class="py-2 px-3 text-left font-medium">基站</th>
                <th class="py-2 px-3 text-left font-medium">等级</th>
                <th class="py-2 px-3 text-left font-medium">置信度</th>
                <th class="py-2 px-3 text-left font-medium">定位误差</th>
                <th class="py-2 px-3 text-left font-medium">时间</th>
                <th class="py-2 px-3 text-left font-medium">状态</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="fault in faultsStore.faults"
                :key="fault.fault_id"
                class="border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors"
                :class="{ 'bg-indigo-50/50': selectedFault?.fault_id === fault.fault_id }"
                @click="selectFault(fault)"
              >
                <td class="py-2 px-3 font-medium text-slate-800">{{ fault.fault_id }}</td>
                <td class="py-2 px-3 text-slate-700">{{ fault.fault_type_cn ?? '--' }}</td>
                <td class="py-2 px-3 text-slate-700">{{ fault.station_id ?? '--' }}</td>
                <td class="py-2 px-3">
                  <StatusBadge
                    :status="levelBadgeStatus(fault.fault_level)"
                  />
                </td>
                <td class="py-2 px-3 text-slate-700">
                  {{ fault.confidence != null ? `${(fault.confidence * 100).toFixed(1)}%` : '--' }}
                </td>
                <td class="py-2 px-3 text-slate-700">
                  {{ fault.localization_error_m != null ? `${fault.localization_error_m.toFixed(1)} m` : '--' }}
                </td>
                <td class="py-2 px-3 text-slate-500">{{ fault.detected_at ?? '--' }}</td>
                <td class="py-2 px-3">
                  <span
                    class="inline-flex items-center px-2 py-0.5 rounded text-[12px] font-medium"
                    :class="{
                      'bg-green-50 text-green-600 border border-green-200': fault.status === '已处理',
                      'bg-blue-50 text-blue-600 border border-blue-200': fault.status === '处理中',
                      'bg-red-50 text-red-600 border border-red-200': fault.status === '未处理',
                      'bg-slate-50 text-slate-500 border border-slate-200': !fault.status || ['已处理','处理中','未处理'].indexOf(fault.status) === -1,
                    }"
                  >
                    {{ fault.status ?? '--' }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
