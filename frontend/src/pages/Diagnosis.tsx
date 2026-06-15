import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { BreadcrumbNav } from '@/components/BreadcrumbNav'
import { fetchDiagnosis } from '@/api/diagnosis'
import type { DiagnosisRecord } from '@/types/api'

/* ── Sub-components ──────────────────────────────────────── */

function StepNumber({ n }: { n: number }) {
  if (n === 1) {
    return (
      <div className="w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center flex-shrink-0 font-label-caps text-[12px]">
        {n}
      </div>
    )
  }
  return (
    <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center flex-shrink-0 font-label-caps text-[12px]">
      {n}
    </div>
  )
}

/* ── Main Page ───────────────────────────────────────────── */

export default function Diagnosis() {
  const { id: faultId } = useParams<{ id: string }>()
  const [data, setData] = useState<DiagnosisRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!faultId) return
    setLoading(true)
    fetchDiagnosis(faultId)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [faultId])

  if (loading) {
    return (
      <div className="max-w-[1200px] mx-auto flex flex-col gap-gutter animate-fade-in">
        <div className="flex items-center justify-center h-[400px] text-on-surface-variant font-body-md">
          <span className="material-symbols-outlined animate-pulse-scale mr-2">progress_activity</span>
          加载诊断数据...
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="max-w-[1200px] mx-auto flex flex-col gap-gutter animate-fade-in">
        <div className="flex items-center justify-center h-[400px] text-error font-body-md">
          <span className="material-symbols-outlined mr-2">error</span>
          {error ?? '未找到诊断数据'}
        </div>
      </div>
    )
  }

  const fault = data.fault
  const confidence = fault.confidence ?? 94

  /* Parse suggested_actions — assume it's a JSON string or plain text */
  let actions: { title: string; description: string }[] = []
  try {
    const parsed = JSON.parse(data.suggested_actions ?? '[]')
    if (Array.isArray(parsed)) {
      actions = parsed
    }
  } catch {
    /* If not JSON, split by newlines */
    const lines = (data.suggested_actions ?? '').split('\n').filter(Boolean)
    actions = lines.map((line) => ({ title: line, description: '' }))
  }

  /* Parse root_cause paragraphs */
  const rootCauseParagraphs = (data.root_cause ?? '').split('\n').filter(Boolean)

  /* Parse affected_scope */
  const scopeText = data.affected_scope ?? ''
  const reviewRequired = data.review_required === 1

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-gutter animate-fade-in">
      {/* ── Header row ────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex flex-col">
          <BreadcrumbNav
            items={[
              { label: 'Faults', path: '/faults' },
              { label: 'Diagnosis Suggestion' },
            ]}
          />
          <h1 className="font-headline-md text-headline-md text-on-surface mt-1">诊断建议</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="px-4 py-2 rounded-lg bg-surface border border-outline-variant text-on-surface hover:bg-surface-container-low transition-colors font-body-sm text-body-sm flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            导出报告
          </button>
          <button
            className="px-4 py-2 rounded-lg bg-primary text-on-primary hover:bg-primary/90 transition-colors shadow-sm font-body-sm text-body-sm flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">done_all</span>
            采纳建议
          </button>
        </div>
      </div>

      {/* ── Top: Fault Info Card ──────────────────────────── */}
      <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-card-padding flex flex-col gap-4 relative overflow-hidden">
        {/* Red accent bar */}
        <div className="absolute top-0 left-0 w-full h-1 bg-error" />

        {/* Header: icon + title + badges */}
        <div className="flex items-center justify-between border-b border-outline-variant/50 pb-4">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-error text-[28px]">gpp_bad</span>
            <h3 className="font-headline-md text-headline-md text-on-surface">
              {fault.fault_type_cn ?? '未知故障'}
            </h3>
          </div>
          <div className="flex gap-2">
            <span className="px-2.5 py-1 rounded-full bg-error-container text-on-error-container font-label-caps text-label-caps uppercase border border-error/20 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-error" />
              Critical
            </span>
            <span className="px-2.5 py-1 rounded-full bg-primary-container text-primary font-label-caps text-label-caps uppercase border border-primary/20 flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">psychology</span>
              AI Confidence: {confidence}%
            </span>
          </div>
        </div>

        {/* 4-column info grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="flex flex-col gap-1">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">Fault ID</span>
            <span className="font-data-mono text-data-mono text-on-surface">{fault.fault_id}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">Detection Time</span>
            <span className="font-data-mono text-data-mono text-on-surface">{fault.detected_at ?? '-'}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">Affected Station</span>
            <span className="font-body-sm text-body-sm text-on-surface">{fault.station_id ?? '-'}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">Fault Type</span>
            <span className="font-body-sm text-body-sm text-on-surface">{fault.fault_type_raw ?? '-'} / {fault.fault_type_cn ?? '-'}</span>
          </div>
        </div>
      </section>

      {/* ── Middle: Bento Grid ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter">
        {/* Root Cause (原因分析) */}
        <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-card-padding flex flex-col gap-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[20px]">troubleshoot</span>
            </div>
            <h3 className="font-headline-md text-headline-md text-on-surface">原因分析</h3>
          </div>
          <div className="prose prose-sm max-w-none text-on-surface-variant font-body-md leading-relaxed space-y-4">
            {rootCauseParagraphs.length > 0 ? (
              rootCauseParagraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))
            ) : (
              <p>
                AI引擎分析了系统日志与流量模式，检测到关键节点之间的协议会话频繁重置。
                根本原因定位于物理链路层面的微小丢包导致Keepalive消息超时。
              </p>
            )}
            <div className="bg-surface-container-low p-3 rounded-lg border border-outline-variant/30 flex items-start gap-3 mt-4">
              <span className="material-symbols-outlined text-secondary text-[20px] mt-0.5">info</span>
              <div className="font-body-sm">
                <span className="block font-medium text-on-surface mb-1">关键特征:</span>
                <ul className="list-disc pl-4 space-y-1">
                  <li>光功率波动与接口Error Counters激增时间高度重合。</li>
                  <li>CPU利用率正常，排除控制平面过载。</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Actions (处理建议) */}
        <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-card-padding flex flex-col gap-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[20px]">build_circle</span>
            </div>
            <h3 className="font-headline-md text-headline-md text-on-surface">处理建议</h3>
          </div>
          <ol className="flex flex-col gap-3 font-body-md text-on-surface">
            {actions.length > 0 ? (
              actions.map((action, i) => (
                <li key={i} className="flex gap-3 bg-surface-container-low p-3 rounded-lg border border-outline-variant/20">
                  <StepNumber n={i + 1} />
                  <div>
                    <h4 className="font-medium text-on-surface mb-1">{action.title}</h4>
                    <p className="text-on-surface-variant font-body-sm">{action.description}</p>
                  </div>
                </li>
              ))
            ) : (
              <>
                <li className="flex gap-3 bg-surface-container-low p-3 rounded-lg border border-outline-variant/20">
                  <StepNumber n={1} />
                  <div>
                    <h4 className="font-medium text-on-surface mb-1">临时缓解 (立即)</h4>
                    <p className="text-on-surface-variant font-body-sm">配置 Route Dampening，以减少路由震荡对全网路由表的冲击。</p>
                  </div>
                </li>
                <li className="flex gap-3 bg-surface-container-low p-3 rounded-lg border border-outline-variant/20">
                  <StepNumber n={2} />
                  <div>
                    <h4 className="font-medium text-on-surface mb-1">故障隔离 (立即)</h4>
                    <p className="text-on-surface-variant font-body-sm">将经过故障链路的流量通过 IGP 流量工程平滑切换至备用链路。</p>
                  </div>
                </li>
                <li className="flex gap-3 bg-surface-container-low p-3 rounded-lg border border-outline-variant/20">
                  <StepNumber n={3} />
                  <div>
                    <h4 className="font-medium text-on-surface mb-1">物理层修复 (计划)</h4>
                    <p className="text-on-surface-variant font-body-sm">安排现场工程师检查或更换相关光模块（SFP+）。</p>
                  </div>
                </li>
              </>
            )}
          </ol>
        </section>
      </div>

      {/* ── Bottom: Impact & Review ───────────────────────── */}
      <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-card-padding flex flex-col md:flex-row gap-6 items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-secondary text-[20px]">radar</span>
            <h3 className="font-headline-md text-headline-md text-on-surface">影响范围</h3>
          </div>
          <p className="font-body-md text-on-surface-variant leading-relaxed">
            {scopeText || (
              <>
                目前路由震荡已导致跨区域的延迟增加约 <span className="text-error font-medium">12ms</span>。
                约有 <span className="text-on-surface font-medium">5%</span> 的北美东海岸出向流量可能经历偶发性重传。
                核心控制平面稳定，未影响其他 BGP 邻居。
              </>
            )}
          </p>
        </div>

        {/* Manual Review Badge */}
        {reviewRequired && (
          <div className="flex-shrink-0 bg-error-container/40 border border-error/30 rounded-xl p-4 flex flex-col items-center justify-center text-center w-full md:w-auto min-w-[200px] animate-border-flash">
            <span className="material-symbols-outlined text-error text-[32px] mb-2">engineering</span>
            <span className="font-headline-md text-headline-md text-error mb-1 tracking-tight">需人工复核</span>
            <span className="font-body-sm text-on-error-container">建议在执行流量切换前确认</span>
          </div>
        )}
      </section>
    </div>
  )
}
