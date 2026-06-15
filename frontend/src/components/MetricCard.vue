<script setup lang="ts">
const props = withDefaults(defineProps<{
  title: string
  value: string | number
  icon?: string
  trend?: string
  trendType?: 'up' | 'down' | 'neutral'
  color?: string
}>(), {
  icon: '',
  trend: '',
  trendType: 'neutral',
  color: 'indigo',
})

const colorMap: Record<string, string> = {
  indigo: '#4338ca',
  red: '#ef4444',
  orange: '#f97316',
  green: '#22c55e',
  yellow: '#eab308',
  gray: '#94a3b8',
}

const trendColorMap: Record<string, string> = {
  up: '#22c55e',
  down: '#ef4444',
  neutral: '#94a3b8',
}

const activeColor = colorMap[props.color] || colorMap.indigo
const trendColor = trendColorMap[props.trendType] || trendColorMap.neutral
</script>

<template>
  <div
    data-ui="metric-card"
    class="h-[92px] bg-white rounded-lg border border-[#E2E8F0] px-5 py-4 shadow-sm transition-shadow hover:shadow-md"
  >
    <div class="flex items-start justify-between">
      <div class="min-w-0">
        <div class="text-[13px] text-slate-500 font-medium leading-tight">{{ title }}</div>
        <div class="mt-2 text-[28px] font-bold text-slate-900 leading-none" :style="{ color: color !== 'indigo' ? activeColor : '' }">
          {{ value }}
        </div>
        <div v-if="trend" class="mt-1 text-[12px] font-medium leading-tight" :style="{ color: trendColor }">
          {{ trend }}
        </div>
      </div>
      <div v-if="icon" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-[18px] font-semibold" :style="{ color: activeColor }">
        {{ icon }}
      </div>
    </div>
  </div>
</template>
