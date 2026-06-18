import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { BreadcrumbNav } from '@/components/BreadcrumbNav'
import { enhanceDiagnosis, fetchDiagnosis } from '@/api/diagnosis'
import { updateFaultStatus } from '@/api/faults'
import { loadStoredLlmConfig, normalizeLlmConfig, saveLlmConfig } from '@/utils/llmConfig'
import type { DiagnosisAction, DiagnosisDisplay, DiagnosisRecord } from '@/types/api'

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

function parseActionText(value: string | null): DiagnosisAction[] {
  const lines = (value ?? '')
    .split('\n')
    .map((line) => line.replace(/^\d+[.、]\s*/, '').trim())
    .filter(Boolean)

  return lines.map((line) => {
    const [title, ...rest] = line.split(/[：:]/)
    return {
      title: title.trim(),
      description: rest.join('：').trim(),
    }
  })
}

function fallbackDisplay(data: DiagnosisRecord): DiagnosisDisplay {
  const fault = data.fault
  const actions = parseActionText(data.suggested_actions)

  return {
    fault_type: fault.fault_type_cn ?? data.fault_type_cn ?? '未知故障',
    source_label: fault.fault_id.startsWith('AI_') ? 'AI在线诊断' : '历史样本诊断',
    root_cause: data.root_cause ?? '系统已识别通信指标异常，需要结合关键KPI和现场告警继续确认根因。',
    key_symptoms: ['关键通信指标偏离正常基线', '业务质量存在下降风险'],
    suggested_actions: actions.length > 0
      ? actions
      : [{ title: '人工复核', description: '请复核RSRP、SINR、BER/BLER、PRB利用率和吞吐量后确认处理方案。' }],
    affected_scope: data.affected_scope ?? '影响范围需要结合故障基站、定位结果和实时业务指标继续确认。',
    evidence: fault.station_id ? [`关联基站：${fault.station_id}`] : [],
    review_required: data.review_required === 1,
    review_reason: data.review_required === 1
      ? '系统诊断结果标记为需要运维人员复核。'
      : '当前规则判断可按建议流程处理，处理后继续观察关键指标恢复情况。',
  }
}

function formatConfidence(value: number | null): string {
  if (value == null) return '-'
  const percent = value <= 1 ? value * 100 : value
  return `${percent.toFixed(1)}%`
}

function buildDiagnosisMarkdown(data: DiagnosisRecord, display: DiagnosisDisplay): string {
  const fault = data.fault
  const actionLines = display.suggested_actions.map((action, index) => (
    `${index + 1}. ${action.title}：${action.description}`
  ))
  const evidenceLines = display.evidence.length > 0
    ? display.evidence.map((item) => `- ${item}`).join('\n')
    : '- 暂无补充依据'
  const symptomLines = display.key_symptoms.length > 0
    ? display.key_symptoms.map((item) => `- ${item}`).join('\n')
    : '- 暂无关键症状'

  return [
    '# 通信故障诊断报告',
    '',
    '## 故障信息',
    '',
    `- 故障编号：${fault.fault_id}`,
    `- 故障类型：${display.fault_type}`,
    `- 严重程度：${fault.fault_level ?? '-'}`,
    `- 处理状态：${fault.status ?? '未处理'}`,
    `- 检测时间：${fault.detected_at ?? '-'}`,
    `- 关联基站：${fault.station_id ?? '-'}`,
    `- 模型置信度：${formatConfidence(fault.confidence)}`,
    `- 诊断来源：${display.source_label}${display.llm_model ? ` (${display.llm_model})` : ''}`,
    '',
    '## 原因分析',
    '',
    display.root_cause,
    '',
    '## 关键症状',
    '',
    symptomLines,
    '',
    '## 诊断依据',
    '',
    evidenceLines,
    '',
    '## 处理建议',
    '',
    actionLines.length > 0 ? actionLines.join('\n') : '1. 人工复核：请结合现场告警和关键 KPI 确认故障根因后处理。',
    '',
    '## 影响范围',
    '',
    display.affected_scope,
    '',
    '## 复核要求',
    '',
    `- 是否需要人工复核：${display.review_required ? '是' : '否'}`,
    `- 复核理由：${display.review_reason}`,
    '',
  ].join('\n')
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([`\ufeff${content}`], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/* ── Main Page ───────────────────────────────────────────── */

export default function Diagnosis() {
  const { id: faultId } = useParams<{ id: string }>()
  const [data, setData] = useState<DiagnosisRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [enhancing, setEnhancing] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!faultId) return
    setLoading(true)
    fetchDiagnosis(faultId)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [faultId])

  const handleEnhanceDiagnosis = async () => {
    if (!faultId) return
    setEnhancing(true)
    setNotice(null)
    const nextConfig = normalizeLlmConfig(loadStoredLlmConfig())
    if (!nextConfig.api_key) {
      setEnhancing(false)
      setNotice('请先到设置页填写大模型 API Key，再执行 AI 增强诊断。')
      return
    }
    saveLlmConfig(nextConfig)
    try {
      const enhanced = await enhanceDiagnosis(faultId, {
        base_url: nextConfig.base_url,
        api_key: nextConfig.api_key,
        model: nextConfig.model,
        timeout_seconds: nextConfig.timeout_seconds,
      })
      setData(enhanced)
      const display = enhanced.display ?? fallbackDisplay(enhanced)
      if (display.llm_enhanced) {
        setNotice(`大模型增强诊断已生成${display.llm_model ? `：${display.llm_model}` : ''}。`)
      } else if (display.llm_error) {
        setNotice(`大模型增强不可用，已保留规则诊断：${display.llm_error}`)
      } else {
        setNotice('大模型增强未启用，已保留规则诊断。')
      }
    } catch (e) {
      setNotice(e instanceof Error ? `大模型增强失败，已保留当前规则诊断：${e.message}` : '大模型增强失败，已保留当前规则诊断。')
    } finally {
      setEnhancing(false)
    }
  }

  const handleAcceptSuggestion = async () => {
    if (!data) return
    const currentStatus = data.fault.status || '未处理'
    if (currentStatus !== '未处理') {
      setNotice(`当前故障状态为“${currentStatus}”，无需重复采纳建议。`)
      return
    }
    setAccepting(true)
    setNotice(null)
    try {
      const updated = await updateFaultStatus(data.fault.fault_id, '处理中')
      setData((current) => current
        ? {
          ...current,
          fault: {
            ...current.fault,
            status: updated.status,
          },
        }
        : current)
      setNotice(`已采纳诊断建议，故障 ${updated.fault_id} 状态已更新为 ${updated.status || '处理中'}。`)
    } catch (e) {
      setNotice(e instanceof Error ? `采纳建议失败：${e.message}` : '采纳建议失败。')
    } finally {
      setAccepting(false)
    }
  }

  const handleExportReport = () => {
    if (!data) return
    const display = data.display ?? fallbackDisplay(data)
    const safeId = data.fault.fault_id.replace(/[\\/:*?"<>|]/g, '_')
    downloadTextFile(`diagnosis_${safeId}.md`, buildDiagnosisMarkdown(data, display))
    setNotice('诊断报告已导出为 Markdown 文件。')
  }

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
  const display = data.display ?? fallbackDisplay(data)
  const confidence = fault.confidence == null ? null : (fault.confidence <= 1 ? fault.confidence * 100 : fault.confidence)
  const reviewRequired = display.review_required
  const faultStatus = fault.status || '未处理'
  const canAccept = faultStatus === '未处理'

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-gutter animate-fade-in">
      {/* ── Header row ────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex flex-col">
          <BreadcrumbNav
            items={[
              { label: '故障日志', path: '/faults' },
              { label: '诊断建议' },
            ]}
          />
          <h1 className="font-headline-md text-headline-md text-on-surface mt-1">诊断建议</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="px-4 py-2 rounded-lg bg-primary-container text-primary border border-primary/20 hover:bg-primary-container/80 transition-colors font-body-sm text-body-sm flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-70"
            type="button"
            onClick={handleEnhanceDiagnosis}
            disabled={enhancing}
          >
            <span className={`material-symbols-outlined text-[18px] ${enhancing ? 'animate-spin-slow' : ''}`}>
              {enhancing ? 'progress_activity' : 'auto_awesome'}
            </span>
            {enhancing ? '增强中' : 'AI增强诊断'}
          </button>
          <button
            className="px-4 py-2 rounded-lg bg-surface border border-outline-variant text-on-surface hover:bg-surface-container-low transition-colors font-body-sm text-body-sm flex items-center gap-2"
            type="button"
            onClick={handleExportReport}
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            导出报告
          </button>
          <button
            className="px-4 py-2 rounded-lg bg-primary text-on-primary hover:bg-primary/90 transition-colors shadow-sm font-body-sm text-body-sm flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-70"
            type="button"
            onClick={handleAcceptSuggestion}
            disabled={accepting || !canAccept}
          >
            <span className={`material-symbols-outlined text-[18px] ${accepting ? 'animate-spin-slow' : ''}`}>
              {accepting ? 'progress_activity' : 'done_all'}
            </span>
            {accepting ? '提交中' : canAccept ? '采纳建议' : '已采纳'}
          </button>
        </div>
      </div>

      {notice ? (
        <div className={[
          'border rounded-lg px-4 py-3 text-body-sm font-body-sm flex items-start gap-2',
          data?.display?.llm_enhanced
            ? 'bg-tertiary-container border-tertiary/30 text-on-tertiary-container'
            : 'bg-surface-container-low border-outline-variant text-on-surface-variant',
        ].join(' ')}
        >
          <span className="material-symbols-outlined text-[18px]">
            {data?.display?.llm_enhanced ? 'auto_awesome' : 'info'}
          </span>
          <span>{notice}</span>
        </div>
      ) : null}

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
              {fault.fault_level ?? '未分级'}
            </span>
            <span className="px-2.5 py-1 rounded-full bg-primary-container text-primary font-label-caps text-label-caps border border-primary/20 flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">psychology</span>
              {confidence == null ? display.source_label : `模型置信度 ${confidence.toFixed(1)}%`}
            </span>
            {display.llm_enhanced ? (
              <span className="px-2.5 py-1 rounded-full bg-tertiary-container text-on-tertiary-container font-label-caps text-label-caps border border-tertiary/20 flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                {display.llm_model ?? 'LLM'}
              </span>
            ) : null}
          </div>
        </div>

        {/* 4-column info grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="flex flex-col gap-1">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">故障编号</span>
            <span className="font-data-mono text-data-mono text-on-surface">{fault.fault_id}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">检测时间</span>
            <span className="font-data-mono text-data-mono text-on-surface">{fault.detected_at ?? '-'}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">关联基站</span>
            <span className="font-body-sm text-body-sm text-on-surface">{fault.station_id ?? '-'}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">故障类型</span>
            <span className="font-body-sm text-body-sm text-on-surface">{display.fault_type}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">处理状态</span>
            <span className="font-body-sm text-body-sm text-on-surface">{faultStatus}</span>
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
            <p>{display.root_cause}</p>
            <div className="bg-surface-container-low p-3 rounded-lg border border-outline-variant/30 flex items-start gap-3 mt-4">
              <span className="material-symbols-outlined text-secondary text-[20px] mt-0.5">info</span>
              <div className="font-body-sm">
                <span className="block font-medium text-on-surface mb-1">关键症状</span>
                <ul className="list-disc pl-4 space-y-1">
                  {display.key_symptoms.map((symptom) => (
                    <li key={symptom}>{symptom}</li>
                  ))}
                </ul>
              </div>
            </div>
            {display.evidence.length > 0 && (
              <div className="bg-surface-container-low p-3 rounded-lg border border-outline-variant/30 flex items-start gap-3">
                <span className="material-symbols-outlined text-secondary text-[20px] mt-0.5">fact_check</span>
                <div className="font-body-sm">
                  <span className="block font-medium text-on-surface mb-1">诊断依据</span>
                  <ul className="list-disc pl-4 space-y-1">
                    {display.evidence.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
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
            {display.suggested_actions.length > 0 ? (
              display.suggested_actions.map((action, i) => (
                <li key={i} className="flex gap-3 bg-surface-container-low p-3 rounded-lg border border-outline-variant/20">
                  <StepNumber n={i + 1} />
                  <div>
                    <h4 className="font-medium text-on-surface mb-1">{action.title}</h4>
                    <p className="text-on-surface-variant font-body-sm">{action.description}</p>
                  </div>
                </li>
              ))
            ) : (
              <li className="flex gap-3 bg-surface-container-low p-3 rounded-lg border border-outline-variant/20">
                <StepNumber n={1} />
                <div>
                  <h4 className="font-medium text-on-surface mb-1">人工复核</h4>
                  <p className="text-on-surface-variant font-body-sm">请结合现场告警和关键KPI确认故障根因后处理。</p>
                </div>
              </li>
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
            {display.affected_scope}
          </p>
        </div>

        {reviewRequired ? (
          <div className="flex-shrink-0 bg-error-container/40 border border-error/30 rounded-xl p-4 flex flex-col items-center justify-center text-center w-full md:w-auto max-w-[280px] animate-border-flash">
            <span className="material-symbols-outlined text-error text-[32px] mb-2">engineering</span>
            <span className="font-headline-md text-headline-md text-error mb-1 tracking-tight">需人工复核</span>
            <span className="font-body-sm text-on-error-container">{display.review_reason}</span>
          </div>
        ) : (
          <div className="flex-shrink-0 bg-surface-container-low border border-outline-variant rounded-xl p-4 flex flex-col items-center justify-center text-center w-full md:w-auto max-w-[280px]">
            <span className="material-symbols-outlined text-primary text-[32px] mb-2">task_alt</span>
            <span className="font-headline-md text-headline-md text-primary mb-1 tracking-tight">自动诊断完成</span>
            <span className="font-body-sm text-on-surface-variant">{display.review_reason}</span>
          </div>
        )}
      </section>
    </div>
  )
}
