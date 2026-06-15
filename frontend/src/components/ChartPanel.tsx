import type { ReactNode } from 'react'

interface ChartPanelProps {
  title: string
  className?: string
  children: ReactNode
}

export function ChartPanel({ title, className = '', children }: ChartPanelProps) {
  return (
    <div
      className={`flex flex-col rounded-lg border border-outline-variant bg-surface-container-lowest p-card-padding shadow-sm ${className}`}
    >
      {/* ── Header ────────────────────────────────────── */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-headline-md text-on-surface">{title}</h2>
        <button
          type="button"
          aria-label={`${title} 更多`}
          className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container"
        >
          <span className="material-symbols-outlined text-[20px]">more_horiz</span>
        </button>
      </div>

      {/* ── Chart area ────────────────────────────────── */}
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}
