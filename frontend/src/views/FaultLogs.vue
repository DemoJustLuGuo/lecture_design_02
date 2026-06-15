<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useFaultsStore } from '../stores/faults'
import FaultTable from '../components/FaultTable.vue'
import type { FaultFilters } from '../types/api'

const router = useRouter()
const faultsStore = useFaultsStore()

const faultTypeFilter = ref<string>('all')
const faultLevelFilter = ref<string>('all')
const faultStatusFilter = ref<string>('all')

const faultTypeOptions = [
  { value: 'all', label: '全部' },
  { value: '信道干扰', label: '信道干扰' },
  { value: '基站故障', label: '基站故障' },
  { value: '带宽不足', label: '带宽不足' },
  { value: '误码过高', label: '误码过高' },
  { value: '信号中断', label: '信号中断' },
]

const faultLevelOptions = [
  { value: 'all', label: '全部' },
  { value: '预警', label: '预警' },
  { value: '一般', label: '一般' },
  { value: '严重', label: '严重' },
]

const faultStatusOptions = [
  { value: 'all', label: '全部' },
  { value: '未处理', label: '未处理' },
  { value: '处理中', label: '处理中' },
  { value: '已处理', label: '已处理' },
  { value: '需复核', label: '需复核' },
]

const currentFilters = computed<FaultFilters>(() => {
  const filters: FaultFilters = {}
  if (faultTypeFilter.value !== 'all') filters.fault_type = faultTypeFilter.value
  if (faultLevelFilter.value !== 'all') filters.fault_level = faultLevelFilter.value
  return filters
})

function applyFilters() {
  faultsStore.loadFaults(currentFilters.value)
}

function goToDiagnosis(faultId: string) {
  router.push(`/diagnosis/${faultId}`)
}

// Watch filter changes and reload
watch([faultTypeFilter, faultLevelFilter], () => {
  applyFilters()
})

onMounted(() => {
  if (faultsStore.faults.length === 0) {
    faultsStore.loadFaults()
  }
})
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <div class="text-[15px] font-semibold text-slate-800">故障日志</div>
        <div class="text-[13px] text-slate-500">查看、筛选和分析故障记录</div>
      </div>
      <button
        @click="faultsStore.loadFaults(currentFilters)"
        class="px-4 py-2 rounded-lg bg-[#4338ca] text-white text-[13px] font-medium hover:bg-[#3730a3] transition-colors"
      >
        刷新数据
      </button>
    </div>

    <!-- Filter bar -->
    <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-100 space-y-3">
      <!-- Fault type filter -->
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium text-slate-600 w-20">故障类型:</span>
        <div class="flex items-center gap-2">
          <button
            v-for="opt in faultTypeOptions"
            :key="opt.value"
            @click="faultTypeFilter = opt.value"
            :class="[
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              faultTypeFilter === opt.value
                ? 'bg-[#4338ca] text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            ]"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
      <!-- Fault level filter -->
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium text-slate-600 w-20">严重程度:</span>
        <div class="flex items-center gap-2">
          <button
            v-for="opt in faultLevelOptions"
            :key="opt.value"
            @click="faultLevelFilter = opt.value"
            :class="[
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              faultLevelFilter === opt.value
                ? 'bg-[#4338ca] text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            ]"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
      <!-- Fault status filter -->
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium text-slate-600 w-20">处理状态:</span>
        <div class="flex items-center gap-2">
          <button
            v-for="opt in faultStatusOptions"
            :key="opt.value"
            @click="faultStatusFilter = opt.value"
            :class="[
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              faultStatusFilter === opt.value
                ? 'bg-[#4338ca] text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            ]"
          >
            {{ opt.label }}
          </button>
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
      <div class="bg-white rounded-xl p-8 shadow-sm border border-slate-100 text-center max-w-md">
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
          @click="faultsStore.loadFaults(currentFilters)"
          class="px-4 py-2 rounded-lg bg-[#4338ca] text-white text-sm font-medium hover:bg-[#3730a3] transition-colors"
        >
          重新加载
        </button>
      </div>
    </div>

    <!-- Fault table -->
    <div v-else-if="faultsStore.faults.length > 0">
      <!-- Apply local status filter -->
      <FaultTable
        :faults="faultsStore.faults.filter(f => faultStatusFilter === 'all' || f.status === faultStatusFilter)"
        @row-click="goToDiagnosis"
      />
    </div>

    <!-- Empty state -->
    <div v-else class="flex items-center justify-center py-20">
      <div class="bg-white rounded-xl p-8 shadow-sm border border-slate-100 text-center max-w-md">
        <div class="w-12 h-12 mx-auto mb-4 rounded-full bg-slate-50 flex items-center justify-center">
          <svg class="w-6 h-6 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
        </div>
        <h3 class="text-base font-semibold text-slate-800 mb-2">暂无故障数据</h3>
        <p class="text-sm text-slate-500 mb-4">当前筛选条件下没有匹配的故障记录</p>
        <button
          @click="faultTypeFilter = 'all'; faultLevelFilter = 'all'; faultStatusFilter = 'all'; faultsStore.loadFaults()"
          class="px-4 py-2 rounded-lg bg-[#4338ca] text-white text-sm font-medium hover:bg-[#3730a3] transition-colors"
        >
          清除筛选
        </button>
      </div>
    </div>
  </div>
</template>
