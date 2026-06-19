import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchFaults } from '@/api/faults'
import { useCountUp } from '@/hooks/useCountUp'
import { EmptyState } from '@/components/EmptyState'
import type { FaultLog } from '@/types/api'

/* ── Alert severity config ──────────────────────────────── */
type AlertSeverity = 'critical' | 'major' | 'minor'

interface SeverityConfig {
  accent: string
  iconBg: string
  iconColor: string
  badgeBg: string
  badgeText: string
  badgeLabel: string
  badgeTextColor: string
}

const severityConfigs: Record<AlertSeverity, SeverityConfig> = {
  critical: {
    accent: 'bg-error',
    iconBg: 'bg-error-container',
    iconColor: 'text-error',
    badgeBg: 'bg-error',
    badgeText: 'text-on-error',
    badgeLabel: '一级 / CRITICAL',
    badgeTextColor: '',
  },
  major: {
    accent: 'bg-tertiary',
    iconBg: 'bg-tertiary-fixed',
    iconColor: 'text-tertiary',
    badgeBg: 'bg-tertiary',
    badgeText: 'text-on-tertiary',
    badgeLabel: '二级 / MAJOR',
    badgeTextColor: '',
  },
  minor: {
    accent: 'bg-primary-container',
    iconBg: 'bg-surface-container-highest',
    iconColor: 'text-primary',
    badgeBg: 'bg-primary-container',
    badgeText: 'text-on-primary-container',
    badgeLabel: '三级 / MINOR',
    badgeTextColor: '',
  },
}

/* ── Severity icons mapping ──────────────────────────────── */
function getAlertIcon(_faultType: string | null, severity: AlertSeverity): string {
  if (severity === 'critical') return 'power_off'
  if (severity === 'major') return 'thermostat'
  return 'router'
}

/* ── Map fault_level to AlertSeverity ────────────────────── */
function mapSeverity(level: string | null): AlertSeverity {
  if (!level) return 'minor'
  const l = level.toLowerCase()
  if (l.includes('critical') || l.includes('严重') || l.includes('一级')) return 'critical'
  if (l.includes('major') || l.includes('预警') || l.includes('二级') || l.includes('warning')) return 'major'
  return 'minor'
}

/* ── Format timestamp to short display ───────────────────── */
function formatTime(ts: string | null): string {
  if (!ts) return '--'
  const d = new Date(ts)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  const ampm = d.getHours() >= 12 ? 'PM' : 'AM'
  return `${h}:${m} ${ampm}`
}

/* ── Main Page ───────────────────────────────────────────── */

export default function MobileAlert() {
  const navigate = useNavigate()
  const [faults, setFaults] = useState<FaultLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetchFaults(5)
      .then(setFaults)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const criticalCount = faults.filter((f) => mapSeverity(f.fault_level) === 'critical').length
  const criticalDisplay = useCountUp(criticalCount, 600)

  const handleMarkAllRead = () => {
    setFaults([])
    setMessage('当前移动端告警已在本地标记为已读。')
  }

  const handleDispatch = (fault: FaultLog) => {
    setMessage(`已为 ${fault.station_id ?? '未知基站'} 的 ${fault.fault_type_cn ?? '未知故障'} 生成演示派单。`)
  }

  if (loading) {
    return (
      <div className="bg-surface-variant min-h-screen flex items-center justify-center p-8">
        <div className="w-full max-w-[480px] h-[850px] bg-background rounded-[40px] device-shadow relative overflow-hidden border-8 border-inverse-surface flex flex-col">
          <div className="flex-1 flex items-center justify-center text-on-surface-variant font-body-md">
            <span aria-hidden="true" className="material-symbols-outlined animate-pulse-scale mr-2">progress_activity</span>
            加载告警数据...
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-surface-variant min-h-screen flex items-center justify-center p-8">
        <div className="w-full max-w-[480px] h-[850px] bg-background rounded-[40px] device-shadow relative overflow-hidden border-8 border-inverse-surface flex flex-col">
          <div className="flex-1 flex items-center justify-center text-error font-body-md">
            <span aria-hidden="true" className="material-symbols-outlined mr-2">error</span>
            {error}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface-variant min-h-screen flex items-center justify-center p-8">
      {/* ── Phone Mockup ──────────────────────────────────── */}
      <div className="w-full max-w-[480px] h-[850px] bg-background rounded-[40px] device-shadow relative overflow-hidden border-8 border-inverse-surface flex flex-col">
        {/* ── Dynamic Island ─────────────────────────────── */}
        <div className="h-6 w-full flex items-center justify-between px-6 text-[11px] font-semibold text-on-surface shrink-0 bg-surface z-10 pt-1">
          <span>9:41</span>
          {/* Notch */}
          <div className="w-32 h-6 bg-inverse-surface absolute top-0 left-1/2 transform -translate-x-1/2 rounded-b-xl" />
          <div className="flex gap-1.5 items-center">
            <span aria-hidden="true" className="material-symbols-outlined text-[14px]">signal_cellular_4_bar</span>
            <span aria-hidden="true" className="material-symbols-outlined text-[14px]">wifi</span>
            <span aria-hidden="true" className="material-symbols-outlined text-[14px]">battery_full</span>
          </div>
        </div>

        {/* ── Phone Header ───────────────────────────────── */}
        <header className="flex items-center justify-between px-4 h-[56px] bg-surface border-b border-outline-variant shrink-0 z-10 relative">
          <button
            aria-label="返回上一页"
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-low transition-colors"
            onClick={() => navigate(-1)}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-on-surface">arrow_back</span>
          </button>
          <h1 className="font-headline-md text-headline-md text-on-surface">移动告警预警</h1>
          <button
            type="button"
            aria-label="查看完整故障日志"
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-low transition-colors relative"
            onClick={() => navigate('/faults')}
            title="查看完整故障日志"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-on-surface">filter_list</span>
            {/* Red dot on filter */}
            {faults.length > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full border border-surface" />
            )}
          </button>
        </header>

        {/* ── Phone Content ──────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-6 bg-background relative animate-fade-in">
          {/* ── Critical Summary Card ─────────────────────── */}
          <section className="bg-surface rounded-[24px] p-6 shadow-sm border border-outline-variant flex flex-col items-center justify-center relative overflow-hidden animate-shake-enter">
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-error-container/20 to-transparent pointer-events-none" />

            {/* Pulsing circles */}
            <div className="relative w-32 h-32 mb-4 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-[3px] border-error opacity-20 animate-ping" style={{ animationDuration: '3s' }} />
              <div className="absolute inset-2 rounded-full border-[2px] border-error opacity-40 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s' }} />
              {/* Inner circle with count */}
              <div className="w-24 h-24 rounded-full bg-error flex items-center justify-center shadow-lg relative z-10">
                <div className="flex flex-col items-center">
                  <span className="font-display-lg text-display-lg text-on-error leading-none">{criticalDisplay}</span>
                </div>
              </div>
            </div>

            <h2 className="font-headline-md text-headline-md text-on-surface">严重网络故障</h2>
            <p className="font-body-md text-on-surface-variant mt-1 text-center">
              {faults.length === 0
                ? '当前演示库还没有移动端告警数据。'
                : '系统检测到关键节点异常，需及时处理。'}
            </p>
          </section>

          {message ? (
            <div className="rounded-xl border border-tertiary/30 bg-tertiary-container px-4 py-3 text-body-sm font-body-sm text-on-tertiary-container">
              {message}
            </div>
          ) : null}

          {/* ── Alert List Section ─────────────────────────── */}
          <section className="flex flex-col gap-4 pb-8">
            {/* Section header */}
            <div className="flex items-center justify-between px-1">
              <h3 className="font-label-caps text-label-caps text-on-surface-variant">最新告警列表 (LATEST ALERTS)</h3>
              <button
                className="font-body-sm text-body-sm text-primary hover:underline disabled:cursor-not-allowed disabled:text-on-surface-variant"
                type="button"
                disabled={faults.length === 0}
                onClick={handleMarkAllRead}
              >
                全部标记已读
              </button>
            </div>

            {/* Alert cards */}
            {faults.map((fault, idx) => {
              const severity = mapSeverity(fault.fault_level)
              const config = severityConfigs[severity]
              const icon = getAlertIcon(fault.fault_type_cn, severity)
              const isFirstCritical = idx === 0 && severity === 'critical'
              const opacity = severity === 'minor' ? 'opacity-80' : ''

              return (
                <article
                  key={fault.fault_id}
                  className={`bg-surface rounded-xl p-4 shadow-sm border border-outline-variant relative overflow-hidden ${isFirstCritical ? 'animate-shake-enter' : ''} ${opacity}`}
                >
                  {/* Left accent bar */}
                  <div className={`absolute top-0 left-0 w-1.5 h-full ${config.accent}`} />

                  {/* Top: icon + title + time */}
                  <div className="flex justify-between items-start mb-3 pl-2">
                    <div className="flex gap-3">
                      <div className={`w-10 h-10 rounded-full ${config.iconBg} flex items-center justify-center shrink-0`}>
                        <span aria-hidden="true" className={`material-symbols-outlined ${config.iconColor}`}>{icon}</span>
                      </div>
                      <div>
                        <h4 className="font-headline-md text-headline-md text-on-surface text-[16px]">{fault.fault_type_cn ?? '未知故障'}</h4>
                        <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">节点: {fault.station_id ?? '-'}</p>
                      </div>
                    </div>
                    <span className="font-data-mono text-data-mono text-on-surface-variant text-[11px] bg-surface-container-low px-2 py-1 rounded">
                      {formatTime(fault.detected_at)}
                    </span>
                  </div>

                  {/* Content card */}
                  <div className="ml-[52px] pl-2">
                    <div className="bg-surface-container-low p-3 rounded-lg border border-outline-variant/30">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`${config.badgeBg} px-2 py-0.5 rounded-sm font-label-caps text-label-caps ${config.badgeText} text-[10px] tracking-wider`}>
                          {config.badgeLabel}
                        </span>
                      </div>
                      <p className="font-body-md text-on-surface text-[13px] leading-relaxed">
                        {severity === 'critical'
                          ? '行动建议: 立即下发工单派驻现场。检查备用电源启动状态，当前蓄电池组预计仅可维持有限时间。'
                          : severity === 'major'
                            ? '行动建议: 环境参数已突破阈值。尝试远程重启相关单元。若15分钟内未见恢复趋势，需联系运维协助排查。'
                            : '系统提示: 指标低于正常基线，暂未发生严重影响。AI诊断预测将在48小时内劣化，建议列入次日巡检计划。'}
                      </p>
                    </div>

                    {/* Action buttons (only for critical/major) */}
                    {severity !== 'minor' && (
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          className="flex-1 bg-primary text-on-primary font-body-sm text-body-sm py-2 rounded-lg font-medium"
                          onClick={() => handleDispatch(fault)}
                        >
                          一键派单
                        </button>
                        <button
                          type="button"
                          className="flex-1 bg-surface border border-outline-variant text-on-surface font-body-sm text-body-sm py-2 rounded-lg font-medium"
                          onClick={() => navigate('/map')}
                        >
                          查看拓扑
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              )
            })}
            {faults.length === 0 ? (
              <EmptyState
                icon="notifications_off"
                title="暂无移动告警"
                description="当前系统处于空白演示状态。导入或生成数据后，严重故障会在这里以移动端预警形式展示。"
                actionLabel="前往系统设置"
                actionTo="/settings"
                secondaryActionLabel="查看故障日志"
                secondaryActionTo="/faults"
                className="bg-surface py-6"
              />
            ) : null}
          </section>
        </main>
      </div>
    </div>
  )
}
