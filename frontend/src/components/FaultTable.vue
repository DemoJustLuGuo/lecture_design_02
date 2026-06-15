<script setup lang="ts">
import type { FaultLog } from '@/types/api'
import StatusBadge from './StatusBadge.vue'

const props = withDefaults(defineProps<{
  faults: FaultLog[]
  loading?: boolean
}>(), {
  loading: false,
})

const emit = defineEmits<{
  select: [fault: FaultLog]
}>()

const faultTypeColors: Record<string, { bg: string; text: string; border: string }> = {
  '信道干扰': { bg: '#eef2ff', text: '#6366f1', border: '#c7d2fe' },
  '基站故障': { bg: '#fef2f2', text: '#ef4444', border: '#fecaca' },
  '带宽不足': { bg: '#fefce8', text: '#eab308', border: '#fde68a' },
  '误码过高': { bg: '#fff7ed', text: '#f97316', border: '#fed7aa' },
  '信号中断': { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
}

function getTypeStyle(typeCn: string | null) {
  if (!typeCn) return { bg: '#f1f5f9', text: '#94a3b8', border: '#e2e8f0' }
  return faultTypeColors[typeCn] || { bg: '#f1f5f9', text: '#94a3b8', border: '#e2e8f0' }
}

function formatConfidence(val: number | null): string {
  if (val === null || val === undefined) return '--'
  return `${(val * 100).toFixed(1)}%`
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--'
  try {
    const d = new Date(dateStr)
    return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return dateStr
  }
}
</script>

<template>
  <div class="bg-white rounded-[0.5rem] border border-[#E2E8F0] overflow-hidden">
    <div v-if="loading" class="flex items-center justify-center py-12 text-slate-400">
      加载中...
    </div>
    <div v-else-if="faults.length === 0" class="flex items-center justify-center py-12 text-slate-400">
      暂无故障记录
    </div>
    <table v-else class="w-full text-[13px]">
      <thead>
        <tr class="border-b border-[#E2E8F0] bg-slate-50">
          <th class="px-4 py-3 text-left font-medium text-slate-600">故障ID</th>
          <th class="px-4 py-3 text-left font-medium text-slate-600">检测时间</th>
          <th class="px-4 py-3 text-left font-medium text-slate-600">基站ID</th>
          <th class="px-4 py-3 text-left font-medium text-slate-600">故障类型</th>
          <th class="px-4 py-3 text-left font-medium text-slate-600">严重程度</th>
          <th class="px-4 py-3 text-left font-medium text-slate-600">置信度</th>
          <th class="px-4 py-3 text-left font-medium text-slate-600">状态</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="fault in faults"
          :key="fault.fault_id"
          class="border-b border-[#E2E8F0] last:border-b-0 cursor-pointer transition-colors duration-150 hover:bg-slate-50"
          @click="emit('select', fault)"
        >
          <td class="px-4 py-3 text-slate-700 font-medium">{{ fault.fault_id }}</td>
          <td class="px-4 py-3 text-slate-500">{{ formatDate(fault.detected_at) }}</td>
          <td class="px-4 py-3 text-slate-700">{{ fault.station_id ?? '--' }}</td>
          <td class="px-4 py-3">
            <span
              class="inline-flex items-center px-2 py-0.5 rounded text-[12px] font-medium border"
              :style="{
                backgroundColor: getTypeStyle(fault.fault_type_cn).bg,
                color: getTypeStyle(fault.fault_type_cn).text,
                borderColor: getTypeStyle(fault.fault_type_cn).border,
                borderStyle: 'solid',
                borderWidth: '1px',
              }"
            >
              {{ fault.fault_type_cn ?? '--' }}
            </span>
          </td>
          <td class="px-4 py-3">
            <StatusBadge :status="(fault.fault_level as any) ?? '未处理'" />
          </td>
          <td class="px-4 py-3 text-slate-700">{{ formatConfidence(fault.confidence) }}</td>
          <td class="px-4 py-3">
            <StatusBadge :status="(fault.status as any) ?? '未处理'" />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
