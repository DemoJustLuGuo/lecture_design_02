<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const props = defineProps<{
  title: string
  data: Array<{ name: string; value: number }>
}>()

const faultTypeColorMap: Record<string, string> = {
  '信道干扰': '#6366f1',
  '基站故障': '#ef4444',
  '带宽不足': '#eab308',
  '正常': '#22c55e',
  '误码过高': '#f97316',
}

const defaultColors = ['#6366f1', '#ef4444', '#eab308', '#22c55e', '#f97316']

const chartRef = ref<HTMLDivElement>()
let chart: echarts.ECharts | null = null

function initChart() {
  if (!chartRef.value) return
  chart = echarts.init(chartRef.value)
  updateChart()
}

function updateChart() {
  if (!chart) return

  const colors = props.data.map(d => faultTypeColorMap[d.name] || defaultColors[props.data.indexOf(d) % defaultColors.length])

  const option: echarts.EChartsOption = {
    title: {
      text: props.title,
      left: 8,
      top: 8,
      textStyle: {
        fontSize: 14,
        fontWeight: 600,
        color: '#334155',
      },
    },
    tooltip: {
      trigger: 'item',
      backgroundColor: '#1e293b',
      borderColor: '#1e293b',
      textStyle: { color: '#fff', fontSize: 12 },
      formatter: (params: any) => {
        return `${params.name}: ${params.value} (${params.percent}%)`
      },
    },
    legend: {
      orient: 'vertical',
      right: 10,
      top: 'center',
      textStyle: { fontSize: 12, color: '#64748b' },
      itemWidth: 12,
      itemHeight: 12,
    },
    series: [
      {
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['35%', '55%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 4,
          borderColor: '#fff',
          borderWidth: 2,
        },
        label: { show: false },
        emphasis: {
          label: {
            show: true,
            fontSize: 13,
            fontWeight: 'bold',
          },
        },
        data: props.data.map((d, i) => ({
          name: d.name,
          value: d.value,
          itemStyle: { color: colors[i] },
        })),
      },
    ],
  }

  chart.setOption(option, true)
}

onMounted(() => {
  initChart()
})

onUnmounted(() => {
  if (chart) {
    chart.dispose()
    chart = null
  }
})

watch(
  () => [props.data, props.title],
  () => updateChart(),
  { deep: true },
)

defineExpose({ chart })
</script>

<template>
  <div ref="chartRef" class="w-full h-[320px]" />
</template>
