<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useDashboardStore } from '../stores/dashboard'
import { useFaultsStore } from '../stores/faults'
import MetricCard from '../components/MetricCard.vue'
import TrendChart from '../components/TrendChart.vue'
import FaultTypeChart from '../components/FaultTypeChart.vue'
import AlertPanel from '../components/AlertPanel.vue'

const dashboardStore = useDashboardStore()
const faultsStore = useFaultsStore()

const faultTypeChartData = computed(() =>
  dashboardStore.summary?.fault_type_counts.map(item => ({
    name: item.fault_type_cn || '未知',
    value: item.count,
  })) ?? [],
)

const faultTrendData = computed(() =>
  dashboardStore.summary?.fault_type_counts.map(item => ({
    time: item.fault_type_cn || '未知',
    value: item.count,
  })) ?? [],
)

onMounted(() => {
  dashboardStore.loadSummary()
  faultsStore.loadFaults({}, 8)
})
</script>

<template>
  <div class="space-y-6">
    <!-- Loading state -->
    <div v-if="dashboardStore.loading" class="flex items-center justify-center py-20">
      <div class="flex flex-col items-center gap-3">
        <div class="w-8 h-8 border-2 border-[#4338ca] border-t-transparent rounded-full animate-spin"></div>
        <span class="text-sm text-slate-500">正在加载监控数据...</span>
      </div>
    </div>

    <!-- Error state -->
    <div v-else-if="dashboardStore.error" class="flex items-center justify-center py-20">
      <div class="bg-white rounded-xl p-8 shadow-sm border border-slate-100 text-center max-w-md">
        <div class="w-12 h-12 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center">
          <svg class="w-6 h-6 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8 L12 12" />
            <path d="M12 16 L12.01 16" />
          </svg>
        </div>
        <h3 class="text-base font-semibold text-slate-800 mb-2">加载失败</h3>
        <p class="text-sm text-slate-500 mb-4">{{ dashboardStore.error }}</p>
        <button
          @click="dashboardStore.loadSummary()"
          class="px-4 py-2 rounded-lg bg-[#4338ca] text-white text-sm font-medium hover:bg-[#3730a3] transition-colors"
        >
          重新加载
        </button>
      </div>
    </div>

    <!-- Data loaded -->
    <template v-else-if="dashboardStore.summary">
      <!-- Top KPI Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="在线基站数"
          :value="`${dashboardStore.summary.station_count} 个`"
          icon="⌁"
          color="indigo"
        />
        <MetricCard
          title="当前告警数"
          :value="`${dashboardStore.summary.fault_count} 条`"
          icon="!"
          color="yellow"
        />
        <MetricCard
          title="严重故障数"
          :value="`${dashboardStore.summary.severe_fault_count} 条`"
          icon="×"
          color="red"
        />
        <MetricCard
          title="检测准确率"
          :value="dashboardStore.summary.classification_accuracy != null
            ? `${(dashboardStore.summary.classification_accuracy * 100).toFixed(1)}%`
            : '--'"
          icon="✓"
          color="indigo"
          :trend="dashboardStore.summary.classification_f1 != null
            ? `F1 ${(dashboardStore.summary.classification_f1 * 100).toFixed(1)}%`
            : ''"
        />
      </div>

      <!-- Charts row -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="lg:col-span-2 bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <TrendChart title="故障数量趋势" :data="faultTrendData" y-label="条" />
        </div>
        <div class="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <FaultTypeChart title="故障类型分布" :data="faultTypeChartData" />
        </div>
      </div>

      <!-- Alert panel -->
      <AlertPanel :alerts="faultsStore.faults" :max="8" />
    </template>

    <!-- Empty state -->
    <template v-else>
      <div class="flex items-center justify-center py-20">
        <div class="bg-white rounded-xl p-8 shadow-sm border border-slate-100 text-center max-w-md">
          <div class="w-12 h-12 mx-auto mb-4 rounded-full bg-slate-50 flex items-center justify-center">
            <svg class="w-6 h-6 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9 L21 9" />
            </svg>
          </div>
          <h3 class="text-base font-semibold text-slate-800 mb-2">暂无数据</h3>
          <p class="text-sm text-slate-500 mb-4">监控总览数据尚未加载</p>
          <button
            @click="dashboardStore.loadSummary()"
            class="px-4 py-2 rounded-lg bg-[#4338ca] text-white text-sm font-medium hover:bg-[#3730a3] transition-colors"
          >
            加载数据
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
