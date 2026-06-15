<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  status: string | null | undefined
}>()

function normalizeStatus(status: string | null | undefined): string {
  if (!status) return '离线'
  if (['正常', '预警', '严重', '离线', '未处理', '处理中', '已处理', '需复核', '一般'].includes(status)) {
    return status
  }
  if (['高', 'high', 'severe', 'critical'].includes(status)) return '严重'
  if (['中', 'medium', 'warning'].includes(status)) return '预警'
  if (['低', 'low', 'normal'].includes(status)) return '正常'
  return '需复核'
}

const statusConfig: Record<string, { bg: string; text: string; border: string }> = {
  '正常':   { bg: '#f0fdf4', text: '#22c55e', border: '#bbf7d0' },
  '预警':   { bg: '#fefce8', text: '#eab308', border: '#fde68a' },
  '严重':   { bg: '#fef2f2', text: '#ef4444', border: '#fecaca' },
  '一般':   { bg: '#eff6ff', text: '#3b82f6', border: '#bfdbfe' },
  '离线':   { bg: '#f1f5f9', text: '#94a3b8', border: '#e2e8f0' },
  '未处理': { bg: '#fef2f2', text: '#ef4444', border: '#fecaca' },
  '处理中': { bg: '#eff6ff', text: '#3b82f6', border: '#bfdbfe' },
  '已处理': { bg: '#f0fdf4', text: '#22c55e', border: '#bbf7d0' },
  '需复核': { bg: '#fefce8', text: '#eab308', border: '#fde68a' },
}

const normalizedStatus = computed(() => normalizeStatus(props.status))
const config = computed(() => statusConfig[normalizedStatus.value] || statusConfig['离线'])
</script>

<template>
  <span
    class="inline-flex items-center px-2 py-0.5 rounded text-[12px] font-medium leading-tight"
    :style="{
      backgroundColor: config.bg,
      color: config.text,
      borderColor: config.border,
      borderWidth: '1px',
      borderStyle: 'solid',
    }"
  >
    {{ normalizedStatus }}
  </span>
</template>
