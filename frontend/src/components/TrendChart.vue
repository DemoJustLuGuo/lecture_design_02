<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const props = withDefaults(defineProps<{
  title: string
  data: Array<{ time: string; value: number }>
  color?: string
  yLabel?: string
}>(), {
  color: '#4338ca',
  yLabel: '',
})

const chartRef = ref<HTMLDivElement>()
let chart: echarts.ECharts | null = null

function initChart() {
  if (!chartRef.value) return
  chart = echarts.init(chartRef.value)
  updateChart()
}

function updateChart() {
  if (!chart) return

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
      trigger: 'axis',
      backgroundColor: '#1e293b',
      borderColor: '#1e293b',
      textStyle: { color: '#fff', fontSize: 12 },
      formatter: (params: any) => {
        const p = params[0]
        return `${p.axisValue}<br/>${p.marker} ${p.seriesName}: ${p.value}`
      },
    },
    grid: {
      left: 50,
      right: 20,
      top: 40,
      bottom: 30,
    },
    xAxis: {
      type: 'category',
      data: props.data.map(d => d.time),
      axisLine: { lineStyle: { color: '#F1F5F9' } },
      axisTick: { show: false },
      axisLabel: { color: '#94a3b8', fontSize: 11 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      name: props.yLabel,
      nameTextStyle: { color: '#94a3b8', fontSize: 11, padding: [0, 40, 0, 0] },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#94a3b8', fontSize: 11 },
      splitLine: { lineStyle: { color: '#F1F5F9', type: 'dashed' } },
    },
    series: [
      {
        name: props.title,
        type: 'line',
        data: props.data.map(d => d.value),
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2, color: props.color },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: props.color + '30' },
            { offset: 1, color: props.color + '05' },
          ]),
        },
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
  () => [props.data, props.title, props.color, props.yLabel],
  () => updateChart(),
  { deep: true },
)

defineExpose({ chart })
</script>

<template>
  <div ref="chartRef" class="w-full h-[320px]" />
</template>
