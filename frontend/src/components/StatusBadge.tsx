type StatusType = 'critical' | 'warning' | 'info' | 'normal' | 'offline'

interface StatusBadgeProps {
  status: StatusType
  label?: string
  size?: 'sm' | 'md'
}

const statusConfig: Record<StatusType, { bg: string; text: string; dot: string }> = {
  critical: {
    bg: 'bg-error-container',
    text: 'text-on-error-container',
    dot: 'bg-error',
  },
  warning: {
    bg: 'bg-[#fff3cd]',
    text: 'text-[#856404]',
    dot: 'bg-[#ffc107]',
  },
  info: {
    bg: 'bg-surface-variant',
    text: 'text-primary-container-dark',
    dot: 'bg-primary',
  },
  normal: {
    bg: 'bg-emerald-100',
    text: 'text-emerald-800',
    dot: 'bg-emerald-500',
  },
  offline: {
    bg: 'bg-surface-container',
    text: 'text-on-surface-variant opacity-75',
    dot: 'bg-on-surface-variant',
  },
}

const defaultLabels: Record<StatusType, string> = {
  critical: '严重',
  warning: '预警',
  info: '提示',
  normal: '正常',
  offline: '离线',
}

const sizeClasses = {
  sm: 'px-1.5 py-0.5 text-[10px] gap-1',
  md: 'px-2.5 py-1 text-[12px] gap-1.5',
}

const dotSizeClasses = {
  sm: 'h-1 w-1',
  md: 'h-1.5 w-1.5',
}

export function StatusBadge({ status, label, size = 'md' }: StatusBadgeProps) {
  const config = statusConfig[status]
  const displayLabel = label ?? defaultLabels[status]

  return (
    <span
      className={`inline-flex items-center rounded-full font-label-caps uppercase tracking-wider ${config.bg} ${config.text} ${sizeClasses[size]}`}
    >
      <span className={`rounded-full ${config.dot} ${dotSizeClasses[size]}`} />
      {displayLabel}
    </span>
  )
}
