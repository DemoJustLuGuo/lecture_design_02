<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useStationsStore } from '../stores/stations'
import StatusBadge from '../components/StatusBadge.vue'

const router = useRouter()
const stationsStore = useStationsStore()

const statusFilter = ref<string>('all')

const statusOptions = [
  { value: 'all', label: '全部' },
  { value: '正常', label: '正常' },
  { value: '预警', label: '预警' },
  { value: '严重', label: '严重' },
  { value: '离线', label: '离线' },
]

const filteredStations = computed(() => {
  if (statusFilter.value === 'all') return stationsStore.stations
  return stationsStore.stations.filter(s => s.status === statusFilter.value)
})

function goToDetail(stationId: string) {
  router.push(`/stations/${stationId}`)
}

onMounted(() => {
  if (stationsStore.stations.length === 0) {
    stationsStore.loadStations()
  }
})
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <div class="text-[15px] font-semibold text-slate-800">基站列表</div>
        <div class="text-[13px] text-slate-500">管理与监控所有通信基站</div>
      </div>
      <button
        @click="stationsStore.loadStations()"
        class="px-4 py-2 rounded-lg bg-[#4338ca] text-white text-[13px] font-medium hover:bg-[#3730a3] transition-colors"
      >
        刷新数据
      </button>
    </div>

    <!-- Filter bar -->
    <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium text-slate-600 mr-2">状态筛选:</span>
        <button
          v-for="opt in statusOptions"
          :key="opt.value"
          @click="statusFilter = opt.value"
          :class="[
            'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
            statusFilter === opt.value
              ? 'bg-[#4338ca] text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          ]"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="stationsStore.loading" class="flex items-center justify-center py-20">
      <div class="flex flex-col items-center gap-3">
        <div class="w-8 h-8 border-2 border-[#4338ca] border-t-transparent rounded-full animate-spin"></div>
        <span class="text-sm text-slate-500">正在加载基站数据...</span>
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
          @click="stationsStore.loadStations()"
          class="px-4 py-2 rounded-lg bg-[#4338ca] text-white text-sm font-medium hover:bg-[#3730a3] transition-colors"
        >
          重新加载
        </button>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else-if="filteredStations.length === 0" class="flex items-center justify-center py-20">
      <div class="bg-white rounded-xl p-8 shadow-sm border border-slate-100 text-center max-w-md">
        <div class="w-12 h-12 mx-auto mb-4 rounded-full bg-slate-50 flex items-center justify-center">
          <svg class="w-6 h-6 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4.976 9.828a6 6 0 0 1 14.048 0" />
            <path d="M12 18 L12 22" />
          </svg>
        </div>
        <h3 class="text-base font-semibold text-slate-800 mb-2">暂无基站数据</h3>
        <p class="text-sm text-slate-500">{{ statusFilter !== 'all' ? '当前筛选条件下无匹配基站' : '基站数据尚未加载' }}</p>
      </div>
    </div>

    <!-- Station table -->
    <div v-else class="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-slate-50 border-b border-slate-100">
              <th class="px-4 py-3 text-left font-semibold text-slate-600">基站ID</th>
              <th class="px-4 py-3 text-left font-semibold text-slate-600">基站名称</th>
              <th class="px-4 py-3 text-left font-semibold text-slate-600">PCI</th>
              <th class="px-4 py-3 text-left font-semibold text-slate-600">经度</th>
              <th class="px-4 py-3 text-left font-semibold text-slate-600">纬度</th>
              <th class="px-4 py-3 text-left font-semibold text-slate-600">状态</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="station in filteredStations"
              :key="station.station_id"
              @click="goToDetail(station.station_id)"
              class="border-b border-slate-50 hover:bg-slate-50/80 cursor-pointer transition-colors"
            >
              <td class="px-4 py-3 text-slate-800 font-medium">{{ station.station_id }}</td>
              <td class="px-4 py-3 text-slate-700">{{ station.gnodeb_id || station.station_id }}</td>
              <td class="px-4 py-3 text-slate-600">{{ station.pci ?? '--' }}</td>
              <td class="px-4 py-3 text-slate-600">{{ station.longitude ?? '--' }}</td>
              <td class="px-4 py-3 text-slate-600">{{ station.latitude ?? '--' }}</td>
              <td class="px-4 py-3">
                <StatusBadge :status="station.status ?? '未知'" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="px-4 py-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-500">
        共 {{ filteredStations.length }} 个基站
      </div>
    </div>
  </div>
</template>
