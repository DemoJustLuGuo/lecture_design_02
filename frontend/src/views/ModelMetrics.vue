<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as echarts from 'echarts'
import MetricCard from '../components/MetricCard.vue'
import { fetchModelEvaluation } from '../api/metrics'
import type { ConfusionMatrixData, ModelEvaluation, ModelEvaluationResponse } from '../types/api'

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */
const loading = ref(false)
const error = ref<string | null>(null)
const evaluationData = ref<ModelEvaluationResponse | null>(null)

/* ------------------------------------------------------------------ */
/*  Anomaly detection metric definitions                               */
/* ------------------------------------------------------------------ */
interface MetricDef {
  key: 'accuracy' | 'precision' | 'recall' | 'f1'
  title: string
  target: number
  unit: string
}

const anomalyDefs: MetricDef[] = [
  { key: 'accuracy',  title: '异常检测 · 准确率', target: 95, unit: '%' },
  { key: 'precision', title: '异常检测 · 精确率', target: 95, unit: '%' },
  { key: 'recall',    title: '异常检测 · 召回率', target: 90, unit: '%' },
  { key: 'f1',        title: '异常检测 · F1 值',  target: 95, unit: '%' },
]

const classificationDefs: MetricDef[] = [
  { key: 'accuracy',  title: '故障分类 · 准确率', target: 90, unit: '%' },
  { key: 'precision', title: '故障分类 · 精确率', target: 90, unit: '%' },
  { key: 'recall',    title: '故障分类 · 召回率', target: 90, unit: '%' },
  { key: 'f1',        title: '故障分类 · F1 值', target: 90, unit: '%' },
]

/* ------------------------------------------------------------------ */
/*  Computed helpers                                                    */
/* ------------------------------------------------------------------ */
const anomalyEvaluation = computed(() =>
  evaluationData.value?.evaluations.find(item => item.model_name === 'IsolationForest') ?? null,
)

const classificationEvaluation = computed(() =>
  evaluationData.value?.evaluations.find(item => item.model_name === 'RandomForestClassifier') ?? null,
)

const confusionMatrix = computed(() => {
  return classificationEvaluation.value?.confusion_matrix?.matrix ?? null
})

const confusionLabels = computed(() => {
  return classificationEvaluation.value?.confusion_matrix?.labels ?? []
})

const localizationError = computed(() => {
  return classificationEvaluation.value?.localization_error_avg_m ?? null
})

const localizationDist = computed(() => {
  return []
})

const detectionLatency = computed(() => {
  return anomalyEvaluation.value?.detection_latency_ms
    ?? classificationEvaluation.value?.detection_latency_ms
    ?? null
})

/* Build MetricCard props for a section */
type TrendType = 'up' | 'down' | 'neutral'

interface MetricCardView {
  title: string
  value: string
  color: string
  trend: string
  trendType: TrendType
}

function buildCardProps(def: MetricDef, dataObj: ModelEvaluation | null): MetricCardView | null {
  const rawVal = dataObj?.[def.key]
  if (rawVal == null) return null
  const pct = rawVal * 100
  const delta = pct - def.target
  const met = delta >= 0
  return {
    title:  def.title,
    value:  `${pct.toFixed(2)}${def.unit}`,
    color:  met ? 'green' : 'orange',
    trend:  met
      ? `目标 ${def.target}${def.unit} · 已达标`
      : `目标 ${def.target}${def.unit} · 差距 ${delta.toFixed(2)}pp`,
    trendType: met ? 'up' : 'down',
  }
}

const anomalyCards = computed(() =>
  anomalyDefs
    .map(d => buildCardProps(d, anomalyEvaluation.value))
    .filter((card): card is MetricCardView => card !== null),
)

const classificationCards = computed(() =>
  classificationDefs
    .map(d => buildCardProps(d, classificationEvaluation.value))
    .filter((card): card is MetricCardView => card !== null),
)

/* ------------------------------------------------------------------ */
/*  ECharts refs                                                       */
/* ------------------------------------------------------------------ */
const confusionChartRef = ref<HTMLElement | null>(null)
const confusionChart = ref<echarts.ECharts | null>(null)

const distChartRef = ref<HTMLElement | null>(null)
const distChart = ref<echarts.ECharts | null>(null)

/* ------------------------------------------------------------------ */
/*  Render confusion matrix heatmap                                    */
/* ------------------------------------------------------------------ */
function renderConfusionMatrix() {
  if (!confusionChartRef.value || !confusionMatrix.value) return
  if (!confusionChart.value) {
    confusionChart.value = echarts.init(confusionChartRef.value)
  }
  const matrix = confusionMatrix.value
  const labels = confusionLabels.value.length > 0
    ? confusionLabels.value
    : ['信道干扰', '基站故障', '带宽不足', '正常', '误码过高']

  const flatData: [number, number, number][] = []
  let maxVal = 0
  for (let i = 0; i < matrix.length; i++) {
    for (let j = 0; j < matrix[i].length; j++) {
      flatData.push([j, i, matrix[i][j]])
      if (matrix[i][j] > maxVal) maxVal = matrix[i][j]
    }
  }

  confusionChart.value.setOption({
    tooltip: {
      formatter: (params: any) => {
        const d = params.data as [number, number, number]
        return `真实: ${labels[d[1]]}<br/>预测: ${labels[d[0]]}<br/>数量: ${d[2]}`
      },
    },
    grid: { top: 40, bottom: 60, left: 100, right: 40 },
    xAxis: {
      type: 'category',
      data: labels,
      position: 'top',
      axisLabel: { fontSize: 12, color: '#64748b' },
      splitArea: { show: true },
    },
    yAxis: {
      type: 'category',
      data: labels,
      axisLabel: { fontSize: 12, color: '#64748b' },
      splitArea: { show: true },
    },
    visualMap: {
      min: 0,
      max: maxVal,
      inRange: {
        color: ['#e2e8f0', '#c4b5fd', '#7c3aed', '#4338ca'],
      },
      orient: 'horizontal',
      left: 'center',
      bottom: 10,
      text: ['高', '低'],
      textStyle: { color: '#64748b', fontSize: 12 },
    },
    series: [{
      type: 'heatmap',
      data: flatData,
      label: {
        show: true,
        formatter: (params: any) => String(params.data[2]),
        fontSize: 12,
        color: '#334155',
      },
      emphasis: {
        itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' },
      },
    }],
  })
}

/* ------------------------------------------------------------------ */
/*  Render localization error distribution bar chart                   */
/* ------------------------------------------------------------------ */
function renderDistChart() {
  if (!distChartRef.value) return
  if (!distChart.value) {
    distChart.value = echarts.init(distChartRef.value)
  }

  const dist = localizationDist.value
  if (!dist || dist.length === 0) {
    distChart.value.setOption({
      title: { text: '定位误差分布', left: 'center', textStyle: { fontSize: 14, color: '#334155' } },
      graphic: { type: 'text', left: 'center', top: 'middle', style: { text: '暂无分布数据', fontSize: 14, fill: '#94a3b8' } },
    })
    return
  }

  // If dist is [counts per bin], we create bins
  // Heuristic: assume bins like 0-20, 20-40, ..., or use data as-is
  const binLabels = dist.length <= 10
    ? dist.map((_: any, i: number) => `${i * 20}-${(i + 1) * 20}m`)
    : dist.map((_: any, i: number) => `区间${i + 1}`)

  distChart.value.setOption({
    title: { text: '定位误差分布', left: 'center', textStyle: { fontSize: 14, color: '#334155' } },
    tooltip: { trigger: 'axis' },
    grid: { top: 40, bottom: 30, left: 50, right: 20 },
    xAxis: { type: 'category', data: binLabels, axisLabel: { fontSize: 11, color: '#64748b' } },
    yAxis: { type: 'value', axisLabel: { fontSize: 11, color: '#64748b' } },
    series: [{
      type: 'bar',
      data: dist,
      itemStyle: { color: '#7c3aed', borderRadius: [4, 4, 0, 0] },
      barWidth: '60%',
    }],
  })
}

/* ------------------------------------------------------------------ */
/*  Data loading                                                       */
/* ------------------------------------------------------------------ */
async function loadData() {
  loading.value = true
  error.value = null
  try {
    const result = await fetchModelEvaluation()
    evaluationData.value = normalizeEvaluationResponse(result)
    await nextTick()
    renderConfusionMatrix()
    renderDistChart()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '加载模型评估数据失败'
    error.value = msg
  } finally {
    loading.value = false
  }
}

function normalizeEvaluationResponse(result: ModelEvaluationResponse): ModelEvaluationResponse {
  return {
    evaluations: result.evaluations.map(item => ({
      ...item,
      confusion_matrix: normalizeConfusionMatrix(item.confusion_matrix),
    })),
  }
}

function normalizeConfusionMatrix(raw: ConfusionMatrixData | string | null): ConfusionMatrixData | null {
  if (!raw) return null
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw) as ConfusionMatrixData
  } catch {
    return null
  }
}

/* Resize charts on window resize */
function handleResize() {
  confusionChart.value?.resize()
  distChart.value?.resize()
}

onMounted(() => {
  loadData()
  window.addEventListener('resize', handleResize)
})

/* Cleanup */
onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  confusionChart.value?.dispose()
  distChart.value?.dispose()
})
</script>

<template>
  <div class="space-y-6">
    <!-- Page header -->
    <div>
      <div class="text-[15px] font-semibold text-slate-800">模型评估</div>
      <div class="text-[13px] text-slate-500">查看 AI 模型的性能指标和评估结果</div>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="flex items-center justify-center py-20">
      <div class="flex flex-col items-center gap-3">
        <div class="w-8 h-8 border-2 border-[#4338ca] border-t-transparent rounded-full animate-spin"></div>
        <span class="text-sm text-slate-500">正在加载模型评估数据...</span>
      </div>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="flex items-center justify-center py-20">
      <div class="bg-white rounded-xl p-8 shadow-sm border border-slate-100 text-center max-w-md">
        <div class="w-12 h-12 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center">
          <svg class="w-6 h-6 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8 L12 12" />
            <path d="M12 16 L12.01 16" />
          </svg>
        </div>
        <h3 class="text-base font-semibold text-slate-800 mb-2">加载失败</h3>
        <p class="text-sm text-slate-500 mb-4">{{ error }}</p>
        <button
          @click="loadData()"
          class="px-4 py-2 rounded-lg bg-[#4338ca] text-white text-sm font-medium hover:bg-[#3730a3] transition-colors"
        >
          重新加载
        </button>
      </div>
    </div>

    <!-- Data loaded -->
    <template v-else-if="evaluationData">
      <!-- Anomaly detection metrics -->
      <div>
        <div class="text-[14px] font-semibold text-slate-700 mb-3">异常检测指标</div>
        <div class="grid grid-cols-4 gap-4">
          <MetricCard
            v-for="card in anomalyCards"
            :key="card.title"
            :title="card.title"
            :value="card.value"
            :color="card.color"
            :trend="card.trend"
            :trend-type="card.trendType"
          />
        </div>
      </div>

      <!-- Fault classification metrics -->
      <div>
        <div class="text-[14px] font-semibold text-slate-700 mb-3">故障分类指标</div>
        <div class="grid grid-cols-4 gap-4">
          <MetricCard
            v-for="card in classificationCards"
            :key="card.title"
            :title="card.title"
            :value="card.value"
            :color="card.color"
            :trend="card.trend"
            :trend-type="card.trendType"
          />
        </div>
      </div>

      <!-- Confusion matrix -->
      <div class="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
        <div class="text-[15px] font-semibold text-slate-800 mb-2">混淆矩阵</div>
        <div class="text-[12px] text-slate-500 mb-4">真实标签（纵轴） vs 预测标签（横轴）</div>
        <div
          ref="confusionChartRef"
          class="w-full"
          style="height: 380px;"
        ></div>
      </div>

      <!-- Localization error + distribution -->
      <div class="grid grid-cols-2 gap-4">
        <!-- Localization error value -->
        <div class="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <div class="text-[15px] font-semibold text-slate-800 mb-2">定位误差</div>
          <div class="flex items-baseline gap-3 mt-4">
            <span class="text-[36px] font-bold text-[#4338ca] leading-none">
              {{ localizationError != null ? localizationError.toFixed(2) : '--' }}
            </span>
            <span class="text-[14px] text-slate-500 font-medium">m</span>
          </div>
          <div class="mt-3 text-[12px] text-slate-400">
            <span>目标 50m</span>
            <span v-if="localizationError != null" class="ml-2">
              · 差距 {{ (localizationError - 50).toFixed(2) }}m
              <span :class="localizationError <= 50 ? 'text-green-600' : 'text-orange-500'">
                {{ localizationError <= 50 ? '(已达标)' : '(未达标)' }}
              </span>
            </span>
          </div>
        </div>

        <!-- Distribution chart -->
        <div class="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <div class="text-[15px] font-semibold text-slate-800 mb-2">定位误差分布</div>
          <div
            ref="distChartRef"
            class="w-full"
            style="height: 260px;"
          ></div>
        </div>
      </div>

      <!-- Detection latency -->
      <div class="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
        <div class="text-[15px] font-semibold text-slate-800 mb-2">检测耗时</div>
        <div class="flex items-baseline gap-3 mt-3">
          <span class="text-[28px] font-bold text-slate-800 leading-none">
            {{ detectionLatency != null ? detectionLatency.toFixed(2) : '--' }}
          </span>
          <span class="text-[14px] text-slate-500 font-medium">ms</span>
        </div>
      </div>
    </template>

    <!-- Empty state (no data at all) -->
    <template v-else>
      <div class="flex items-center justify-center py-20">
        <div class="bg-white rounded-xl p-8 shadow-sm border border-slate-100 text-center max-w-md">
          <div class="w-12 h-12 mx-auto mb-4 rounded-full bg-slate-50 flex items-center justify-center">
            <svg class="w-6 h-6 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9 L21 9" />
            </svg>
          </div>
          <h3 class="text-base font-semibold text-slate-800 mb-2">暂无评估数据</h3>
          <p class="text-sm text-slate-500 mb-4">模型评估结果尚未加载</p>
          <button
            @click="loadData()"
            class="px-4 py-2 rounded-lg bg-[#4338ca] text-white text-sm font-medium hover:bg-[#3730a3] transition-colors"
          >
            加载数据
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
