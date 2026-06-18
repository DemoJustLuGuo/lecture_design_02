import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useECharts } from '@/hooks/useECharts'
import { useCountUp } from '@/hooks/useCountUp'
import { EmptyState } from '@/components/EmptyState'
import { fetchModelEvaluation } from '@/api/metrics'
import { COLORS, FONT, mergeOption } from '@/theme'
import type { ModelEvaluation, ConfusionMatrixData } from '@/types/api'

/* ── Confusion Matrix Cell ──────────────────────────────── */
function MatrixCell({ value, maxVal, isDiag, row }: { value: number; maxVal: number; isDiag: boolean; row: number }) {
  const ratio = maxVal > 0 ? value / maxVal : 0
  /* Color opacity based on ratio; diagonal cells are stronger */
  const bgClass = value === 0
    ? 'bg-surface-container text-on-surface'
    : isDiag
      ? 'bg-primary/90 text-white'
      : ratio > 0.05
        ? `bg-primary/${Math.max(20, Math.round(ratio * 100))} text-on-surface`
        : 'bg-primary/10 text-on-surface'
  /* Stagger delay per row */
  const delay = row * 80
  return (
    <div
      className={`${bgClass} p-3 rounded-sm animate-fade-in`}
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      {value}
    </div>
  )
}

/* ── Metric Card for Macro Average ──────────────────────── */
function MacroMetricCard({ label, value }: { label: string; value: number }) {
  const displayValue = useCountUp(value, 1200, '%')
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-card-padding flex flex-col relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full bg-chart-green" />
      <span className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-1">{label}</span>
      <div className="font-data-mono text-[24px] font-semibold text-on-surface">
        {displayValue}
      </div>
    </div>
  )
}

function toPercent(value: number): number {
  return value <= 1 ? value * 100 : value
}

/* ── Main Page ───────────────────────────────────────────── */

export default function ModelEval() {
  const barChartRef = useRef<HTMLDivElement>(null)
  const [evaluations, setEvaluations] = useState<ModelEvaluation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetchModelEvaluation()
      .then(setEvaluations)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  /* Prefer the classification evaluation because it carries the confusion matrix. */
  const evalData = evaluations.find((item) => item.confusion_matrix) ?? evaluations[0]
  const hasEvaluation = evaluations.length > 0
  const accuracy = evalData?.accuracy != null ? toPercent(evalData.accuracy) : 0
  const precision = evalData?.precision != null ? toPercent(evalData.precision) : 0
  const recall = evalData?.recall != null ? toPercent(evalData.recall) : 0
  const f1 = evalData?.f1 != null ? toPercent(evalData.f1) : 0
  const localizationError = evalData?.localization_error_avg_m ?? 0
  const confusionMatrix: ConfusionMatrixData | null = evalData?.confusion_matrix ?? null

  /* Default labels and matrix if API doesn't provide */
  const labels = confusionMatrix?.labels ?? []
  const matrix = confusionMatrix?.matrix ?? []
  const maxVal = matrix.length > 0 ? Math.max(...matrix.flat()) : 0

  /* Determine if below target */
  const target = 95
  const isBelow = (val: number) => val < target

  /* Count-up values for metrics */
  const accDisplay = useCountUp(accuracy, 1000, '%')
  const precDisplay = useCountUp(precision, 1000, '%')
  const recDisplay = useCountUp(recall, 1000, '%')
  const f1Display = useCountUp(f1, 1000, '%')

  /* ── ECharts option for localization error bar chart ──── */
  const barOptionFactory = useCallback(() => {
    return mergeOption({
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '8%',
        top: '8%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: ['0-20', '20-40', '40-60', '60-80', '>80'],
        axisLabel: { color: COLORS.onSurfaceVariant, fontFamily: FONT.mono, fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        max: 500,
        axisLabel: { color: COLORS.onSurfaceVariant, fontFamily: FONT.mono, fontSize: 10 },
        splitLine: { lineStyle: { color: COLORS.outlineVariant, type: 'dashed', opacity: 0.15 } },
      },
      series: [
        {
          name: '样本数',
          type: 'bar',
          data: [
            { value: 400, itemStyle: { color: COLORS.primary } },
            { value: 325, itemStyle: { color: COLORS.primary } },
            { value: 200, itemStyle: { color: COLORS.primary } },
            { value: 150, itemStyle: { color: COLORS.primary } },
            { value: 225, itemStyle: { color: COLORS.error } },
          ],
          barWidth: '60%',
          itemStyle: { borderRadius: [4, 4, 0, 0] },
        },
      ],
    })
  }, [])

  useECharts(barChartRef, barOptionFactory)

  const handleExportReport = useCallback(() => {
    const rows = [
      ['模型名称', evalData?.model_name ?? '--'],
      ['数据集版本', evalData?.dataset_version ?? '--'],
      ['Accuracy', `${accuracy.toFixed(2)}%`],
      ['Precision', `${precision.toFixed(2)}%`],
      ['Recall', `${recall.toFixed(2)}%`],
      ['F1', `${f1.toFixed(2)}%`],
      ['平均定位误差(m)', localizationError.toFixed(2)],
      ['评估时间', evalData?.created_at ?? '--'],
    ]
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `model_evaluation_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }, [accuracy, evalData, f1, localizationError, precision, recall])

  if (loading) {
    return (
      <div className="max-w-[1440px] mx-auto space-y-gutter animate-fade-in">
        <div className="flex items-center justify-center h-[400px] text-on-surface-variant font-body-md">
          <span className="material-symbols-outlined animate-pulse-scale mr-2">progress_activity</span>
          加载模型评估数据...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-[1440px] mx-auto space-y-gutter animate-fade-in">
        <div className="flex items-center justify-center h-[400px] text-error font-body-md">
          <span className="material-symbols-outlined mr-2">error</span>
          {error}
        </div>
      </div>
    )
  }

  if (!hasEvaluation) {
    return (
      <div className="max-w-[1440px] mx-auto space-y-gutter animate-fade-in">
        <div>
          <h3 className="font-headline-md text-headline-md text-on-surface">整体性能指标 (Overall Performance)</h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
            当前还没有模型评估记录。
          </p>
        </div>
        <EmptyState
          icon="analytics"
          title="暂无模型评估结果"
          description="当前 SQLite 中没有写入模型评估记录。请先通过系统设置刷新阶段数据或生成演示数据，再回到这里查看准确率、混淆矩阵和定位误差。"
          actionLabel="前往系统设置"
          actionTo="/settings"
          secondaryActionLabel="查看监控总览"
          secondaryActionTo="/"
        />
      </div>
    )
  }

  return (
    <div className="max-w-[1440px] mx-auto space-y-gutter animate-fade-in">
      {/* ── Section Header ────────────────────────────────── */}
      <div className="flex justify-between items-end mb-4">
        <div>
          <h3 className="font-headline-md text-headline-md text-on-surface">整体性能指标 (Overall Performance)</h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">基准测试集评估结果 - Target: &gt;95%</p>
        </div>
        <button
          className="bg-surface border border-outline-variant text-on-surface px-4 py-2 rounded font-label-caps text-label-caps hover:bg-surface-container-low transition-colors flex items-center gap-2"
          type="button"
          onClick={handleExportReport}
        >
          <span className="material-symbols-outlined text-[16px]">download</span>
          导出报告
        </button>
      </div>

      {/* ── Row 1: 4 Metric Cards ─────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter">
        {/* Accuracy Card */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-card-padding flex flex-col relative overflow-hidden group">
          <div className={`absolute top-0 left-0 w-1 h-full ${isBelow(accuracy) ? 'bg-chart-yellow' : 'bg-chart-green'}`} />
          <div className="flex justify-between items-start mb-2">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">Accuracy</span>
            <span className={`material-symbols-outlined text-[18px] ${isBelow(accuracy) ? 'text-chart-yellow' : 'text-chart-green'}`}>
              {isBelow(accuracy) ? 'warning' : 'check_circle'}
            </span>
          </div>
          <div className="font-data-mono text-display-lg text-on-surface my-1">
            {accDisplay}
          </div>
          <div className="flex items-center gap-2 mt-auto pt-2 border-t border-surface-container-high">
            <span className={`font-data-mono font-body-sm ${isBelow(accuracy) ? 'text-chart-yellow' : 'text-chart-green'}`}>Target: 95%</span>
            <span className="font-data-mono text-body-sm text-on-surface-variant ml-auto">
              {isBelow(accuracy) ? `${(accuracy - target).toFixed(2)}%` : '+'}
            </span>
          </div>
        </div>

        {/* Precision Card */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-card-padding flex flex-col relative overflow-hidden group">
          <div className={`absolute top-0 left-0 w-1 h-full ${isBelow(precision) ? 'bg-chart-yellow' : 'bg-chart-green'}`} />
          <div className="flex justify-between items-start mb-2">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">Precision</span>
            <span className={`material-symbols-outlined text-[18px] ${isBelow(precision) ? 'text-chart-yellow' : 'text-chart-green'}`}>
              {isBelow(precision) ? 'warning' : 'check_circle'}
            </span>
          </div>
          <div className="font-data-mono text-display-lg text-on-surface my-1">
            {precDisplay}
          </div>
          <div className="flex items-center gap-2 mt-auto pt-2 border-t border-surface-container-high">
            <span className={`font-data-mono font-body-sm ${isBelow(precision) ? 'text-chart-yellow' : 'text-chart-green'}`}>Target: 95%</span>
            <span className="font-data-mono text-body-sm text-on-surface-variant ml-auto">
              {isBelow(precision) ? `${(precision - target).toFixed(2)}%` : '+'}
            </span>
          </div>
        </div>

        {/* Recall Card */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-card-padding flex flex-col relative overflow-hidden group">
          <div className={`absolute top-0 left-0 w-1 h-full ${isBelow(recall) ? 'bg-chart-yellow' : 'bg-chart-green'}`} />
          <div className="flex justify-between items-start mb-2">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">Recall</span>
            <span className={`material-symbols-outlined text-[18px] ${isBelow(recall) ? 'text-chart-yellow' : 'text-chart-green'}`}>
              {isBelow(recall) ? 'warning' : 'check_circle'}
            </span>
          </div>
          <div className="font-data-mono text-display-lg text-on-surface my-1">
            {recDisplay}
          </div>
          <div className="flex items-center gap-2 mt-auto pt-2 border-t border-surface-container-high">
            <span className={`font-data-mono font-body-sm ${isBelow(recall) ? 'text-chart-yellow' : 'text-chart-green'}`}>Target: 95%</span>
            <span className="font-data-mono text-body-sm text-on-surface-variant ml-auto">
              {isBelow(recall) ? `${(recall - target).toFixed(2)}%` : '+'}
            </span>
          </div>
        </div>

        {/* F1 Score Card */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-card-padding flex flex-col relative overflow-hidden group">
          <div className={`absolute top-0 left-0 w-1 h-full ${isBelow(f1) ? 'bg-chart-yellow' : 'bg-chart-green'}`} />
          <div className="flex justify-between items-start mb-2">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">F1 Score</span>
            <span className={`material-symbols-outlined text-[18px] ${isBelow(f1) ? 'text-chart-yellow' : 'text-chart-green'}`}>
              {isBelow(f1) ? 'warning' : 'check_circle'}
            </span>
          </div>
          <div className="font-data-mono text-display-lg text-on-surface my-1">
            {f1Display}
          </div>
          <div className="flex items-center gap-2 mt-auto pt-2 border-t border-surface-container-high">
            <span className={`font-data-mono font-body-sm ${isBelow(f1) ? 'text-chart-yellow' : 'text-chart-green'}`}>Target: 95%</span>
            <span className="font-data-mono text-body-sm text-on-surface-variant ml-auto">
              {isBelow(f1) ? `${(f1 - target).toFixed(2)}%` : '+'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Row 2: Macro Average ──────────────────────────── */}
      <div className="mt-8 mb-4">
        <h4 className="font-headline-md text-[16px] text-on-surface">宏观平均 (Macro Average - Optimal)</h4>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter">
        <MacroMetricCard label="Macro Accuracy" value={99.12} />
        <MacroMetricCard label="Macro Precision" value={99.45} />
        <MacroMetricCard label="Macro Recall" value={99.08} />
        <MacroMetricCard label="Macro F1" value={99.26} />
      </div>

      {/* ── Row 3: Confusion Matrix + Positioning Error ──── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter mt-8">
        {/* Confusion Matrix */}
        <div className="lg:col-span-7 bg-surface-container-lowest border border-outline-variant rounded-xl flex flex-col">
          <div className="p-card-padding border-b border-outline-variant flex justify-between items-center bg-surface/50 rounded-t-xl">
            <div>
              <h4 className="font-headline-md text-[16px] text-on-surface">混淆矩阵 (Confusion Matrix)</h4>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Top 5 Fault Categories</p>
            </div>
            <span className="material-symbols-outlined text-outline">grid_on</span>
          </div>
          <div className="p-card-padding flex-1 flex items-center justify-center overflow-x-auto">
            <div className="inline-grid grid-cols-[auto_repeat(5,1fr)] grid-rows-[auto_repeat(5,1fr)] gap-1 text-center font-data-mono font-body-sm">
              {/* Headers X */}
              <div />
              {labels.map((l) => (
                <div key={l} className="p-2 text-on-surface-variant text-[11px] truncate max-w-[80px]" title={l}>{l}</div>
              ))}
              {/* Rows */}
              {matrix.map((row, rowIdx) => (
                <React.Fragment key={`row-${rowIdx}`}>
                  <div className="p-2 text-on-surface-variant text-[11px] text-right flex items-center justify-end" title={labels[rowIdx]}>
                    {labels[rowIdx]}
                  </div>
                  {row.map((val, colIdx) => (
                    <MatrixCell key={`cell-${rowIdx}-${colIdx}`} value={val} maxVal={maxVal} isDiag={rowIdx === colIdx} row={rowIdx} />
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        {/* Positioning Error Distribution */}
        <div className="lg:col-span-5 bg-surface-container-lowest border border-outline-variant rounded-xl flex flex-col">
          <div className="p-card-padding border-b border-outline-variant flex justify-between items-start bg-surface/50 rounded-t-xl">
            <div>
              <h4 className="font-headline-md text-[16px] text-on-surface">定位误差 (Positioning Error)</h4>
              <p className="font-body-sm text-body-sm text-on-surface-variant">距离分布直方图</p>
            </div>
            <div className="text-right">
              <div className="font-data-mono text-[20px] font-bold text-error">{localizationError.toFixed(2)}m</div>
              <div className="font-label-caps text-label-caps text-on-surface-variant">Avg Error</div>
            </div>
          </div>
          <div className="p-card-padding flex-1">
            <div ref={barChartRef} style={{ height: 280, width: '100%' }} />
          </div>
        </div>
      </div>
    </div>
  )
}
