interface MetricCardProps {
  label: string
  value: string | number
  icon: string
  iconColor?: string
  trend?: {
    direction: 'up' | 'down'
    value: string
    color?: string
  }
  borderColor?: string
  bgColor?: string
  errorVariant?: boolean
}

export function MetricCard({
  label,
  value,
  icon,
  iconColor = 'text-primary',
  trend,
  borderColor,
  bgColor,
  errorVariant = false,
}: MetricCardProps) {
  const trendColor =
    trend?.color ?? (trend?.direction === 'up' ? 'text-emerald-600' : 'text-error')

  const trendIcon = trend?.direction === 'up' ? 'trending_up' : 'trending_down'

  return (
    <div
      className={[
        'flex flex-col rounded-lg border p-card-padding transition-colors',
        errorVariant
          ? 'border-error/30 bg-error-container/10 hover:border-error/50'
          : 'border-outline-variant bg-surface-container-lowest hover:border-primary/50',
        bgColor ? `bg-${bgColor}` : '',
        borderColor ? `border-${borderColor}` : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* ── Top row: label + icon ─────────────────────── */}
      <div className="flex items-start justify-between">
        <span className="font-label-caps uppercase tracking-widest text-secondary">
          {label}
        </span>
        <span
          className={`material-symbols-outlined icon-fill text-[20px] ${iconColor}`}
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          {icon}
        </span>
      </div>

      {/* ── Bottom row: value + trend ─────────────────── */}
      <div className="mt-auto flex items-end gap-3 pt-3">
        <span className="font-display-lg text-on-surface leading-none tracking-tight">
          {value}
        </span>
        {trend && (
          <span className={`font-data-mono flex items-center gap-1 text-[13px] leading-none ${trendColor}`}>
            <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              {trendIcon}
            </span>
            {trend.value}
          </span>
        )}
      </div>
    </div>
  )
}
