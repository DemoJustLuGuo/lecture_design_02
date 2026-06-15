<script setup lang="ts">
import { computed } from 'vue'
import type { FaultLog } from '@/types/api'
import StatusBadge from './StatusBadge.vue'

const props = withDefaults(defineProps<{
  alerts: FaultLog[]
  max?: number
}>(), {
  max: 5,
})

function severityOrder(level: string | null): number {
  switch (level) {
    case '严重': return 0
    case '预警': return 1
    case '一般': return 2
    default: return 3
  }
}

const sortedAlerts = computed(() =>
  [...props.alerts]
    .sort((a, b) => severityOrder(a.fault_level) - severityOrder(b.fault_level))
    .slice(0, props.max),
)

function formatTime(dateStr: string | null): string {
  if (!dateStr) return '--'
  try {
    const d = new Date(dateStr)
    return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return dateStr
  }
}

function getFaultDescription(fault: FaultLog): string {
  const parts: string[] = []
  if (fault.fault_type_cn) parts.push(fault.fault_type_cn)
  if (fault.confidence !== null) parts.push(`置信度 ${(fault.confidence * 100).toFixed(0)}%`)
  if (fault.station_id) parts.push(`基站 ${fault.station_id}`)
  return parts.length > 0 ? parts.join('，') : '未知故障'
}
</script>

<template>
  <div class="bg-white rounded-[0.5rem] border border-[#E2E8F0] p-[20px]">
    <div class="text-[14px] font-semibold text-slate-800 mb-3">实时告警</div>
    <div v-if="sortedAlerts.length === 0" class="text-slate-400 text-[13px] py-4 text-center">
      当前无活跃告警
    </div>
    <div v-else class="space-y-3">
      <div
        v-for="alert in sortedAlerts"
        :key="alert.fault_id"
        class="flex items-start gap-3 p-3 rounded-lg border border-[#E2E8F0] bg-slate-50/50 transition-colors hover:bg-slate-50"
      >
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-[12px] text-slate-400">{{ formatTime(alert.detected_at) }}</span>
            <StatusBadge :status="(alert.fault_level as any) ?? '未处理'" />
          </div>
          <div class="text-[13px] font-medium text-slate-700">
            {{ alert.station_id ?? '未知基站' }}
          </div>
          <div class="text-[12px] text-slate-500 mt-0.5 truncate">
            {{ getFaultDescription(alert) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
