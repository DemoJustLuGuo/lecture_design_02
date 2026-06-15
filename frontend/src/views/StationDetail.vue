<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useStationsStore } from '../stores/stations'
import StatusBadge from '../components/StatusBadge.vue'
import TrendChart from '../components/TrendChart.vue'

const route = useRoute()
const router = useRouter()
const stationsStore = useStationsStore()

const stationId = computed(() => route.params.id as string)
const station = computed(() => stationsStore.currentStation)

// Transform recent_metrics into chart-friendly format
const metricChartData = computed(() => {
  if (!station.value?.recent_metrics) return []
  return station.value.recent_metrics
    .filter(m => m.rsrp !== null)
    .map(m => ({
      time: m.timestamp,
      value: m.rsrp ?? 0,
    }))
})

onMounted(() => {
  stationsStore.loadStationDetail(stationId.value)
})

function goBack() {
  router.push('/stations')
}

function formatValue(val: number | null, suffix: string = ''): string {
  if (val === null) return '--'
  return `${val}${suffix}`
}
</script>

<template>
  <div class="space-y-6">
    <!-- Back navigation -->
    <div class="flex items-center gap-2">
      <button
        @click="goBack()"
        class="flex items-center gap-1 text-sm text-slate-500 hover:text-[#4338ca] transition-colors"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12 H5" />
          <path d="M12 19 L5 12 L12 5" />
        </svg>
        返回基站列表
      </button>
    </div>

    <!-- Loading state -->
    <div v-if="stationsStore.loading" class="flex items-center justify-center py-20">
      <div class="flex flex-col items-center gap-3">
        <div class="w-8 h-8 border-2 border-[#4338ca] border-t-transparent rounded-full animate-spin"></div>
        <span class="text-sm text-slate-500">正在加载基站详情...</span>
      </div>
    </div>

    <!-- Error state -->
    <div v-else-if="stationsStore.error" class="flex items-center justify-center py-20">
      <div class="bg-white rounded-xl p-8 shadow-sm border border-slate-100 text-center max-w-md">
        <div class="w-12 h-12 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center">
          <svg class="w-6 h-6 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8 L12 12" />
            <path d="M12 16 L12.01 16" />
          </svg>
        </div>
        <h3 class="text-base font-semibold text-slate-800 mb-2">加载失败</h3>
        <p class="text-sm text-slate-500 mb-4">{{ stationsStore.error }}</p>
        <button
          @click="stationsStore.loadStationDetail(stationId)"
          class="px-4 py-2 rounded-lg bg-[#4338ca] text-white text-sm font-medium hover:bg-[#3730a3] transition-colors"
        >
          重新加载
        </button>
      </div>
    </div>

    <!-- Data loaded -->
    <template v-else-if="station">
      <!-- Station info card -->
      <div class="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
        <div class="flex items-center justify-between mb-5">
          <div>
            <h3 class="text-base font-semibold text-slate-800">基站信息</h3>
            <p class="text-sm text-slate-500 mt-1">基站 ID: {{ station.station_id }}</p>
          </div>
          <StatusBadge :status="station.status ?? '未知'" />
        </div>
        <div class="grid grid-cols-4 gap-4">
          <div class="space-y-1">
            <div class="text-xs text-slate-500">gNodeB ID</div>
            <div class="text-sm font-medium text-slate-800">{{ station.gnodeb_id ?? '--' }}</div>
          </div>
          <div class="space-y-1">
            <div class="text-xs text-slate-500">Cell ID</div>
            <div class="text-sm font-medium text-slate-800">{{ station.cell_id ?? '--' }}</div>
          </div>
          <div class="space-y-1">
            <div class="text-xs text-slate-500">PCI</div>
            <div class="text-sm font-medium text-slate-800">{{ station.pci ?? '--' }}</div>
          </div>
          <div class="space-y-1">
            <div class="text-xs text-slate-500">发射功率</div>
            <div class="text-sm font-medium text-slate-800">{{ formatValue(station.tx_power, ' dBm') }}</div>
          </div>
          <div class="space-y-1">
            <div class="text-xs text-slate-500">经度</div>
            <div class="text-sm font-medium text-slate-800">{{ formatValue(station.longitude) }}</div>
          </div>
          <div class="space-y-1">
            <div class="text-xs text-slate-500">纬度</div>
            <div class="text-sm font-medium text-slate-800">{{ formatValue(station.latitude) }}</div>
          </div>
          <div class="space-y-1">
            <div class="text-xs text-slate-500">方位角</div>
            <div class="text-sm font-medium text-slate-800">{{ formatValue(station.azimuth, '°') }}</div>
          </div>
          <div class="space-y-1">
            <div class="text-xs text-slate-500">下倾角</div>
            <div class="text-sm font-medium text-slate-800">{{ formatValue(station.downtilt, '°') }}</div>
          </div>
        </div>
      </div>

      <!-- Metrics trend chart -->
      <div class="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
        <h3 class="text-[15px] font-semibold text-slate-800 mb-4">近期指标趋势</h3>
        <div v-if="metricChartData && metricChartData.length > 0">
          <TrendChart title="RSRP 近期趋势" :data="metricChartData" y-label="dBm" />
        </div>
        <div v-else class="py-12 text-center text-sm text-slate-400">
          暂无指标数据
        </div>
      </div>

      <!-- Related faults -->
      <div class="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
        <h3 class="text-[15px] font-semibold text-slate-800 mb-4">关联故障记录</h3>
        <div v-if="station.recent_metrics && station.recent_metrics.some(m => m.is_fault === 1)">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-slate-50 border-b border-slate-100">
                <th class="px-4 py-2.5 text-left font-semibold text-slate-600">时间</th>
                <th class="px-4 py-2.5 text-left font-semibold text-slate-600">故障类型</th>
                <th class="px-4 py-2.5 text-left font-semibold text-slate-600">RSRP</th>
                <th class="px-4 py-2.5 text-left font-semibold text-slate-600">SINR</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(m, idx) in station.recent_metrics.filter(m => m.is_fault === 1)"
                :key="idx"
                class="border-b border-slate-50"
              >
                <td class="px-4 py-2.5 text-slate-700">{{ m.timestamp ?? '--' }}</td>
                <td class="px-4 py-2.5 text-slate-700">{{ m.fault_type_cn ?? '--' }}</td>
                <td class="px-4 py-2.5 text-slate-600">{{ m.rsrp ?? '--' }}</td>
                <td class="px-4 py-2.5 text-slate-600">{{ m.sinr ?? '--' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="py-8 text-center text-sm text-slate-400">
          该基站暂无关联故障记录
        </div>
      </div>
    </template>

    <!-- Empty state (no station data) -->
    <template v-else>
      <div class="flex items-center justify-center py-20">
        <div class="bg-white rounded-xl p-8 shadow-sm border border-slate-100 text-center max-w-md">
          <h3 class="text-base font-semibold text-slate-800 mb-2">基站信息未找到</h3>
          <p class="text-sm text-slate-500 mb-4">无法获取基站 {{ stationId }} 的详细信息</p>
          <button
            @click="stationsStore.loadStationDetail(stationId)"
            class="px-4 py-2 rounded-lg bg-[#4338ca] text-white text-sm font-medium hover:bg-[#3730a3] transition-colors"
          >
            重新加载
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
