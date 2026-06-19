import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface EmptyStateProps {
  icon?: string
  title: string
  description: string
  actionLabel?: string
  actionTo?: string
  secondaryActionLabel?: string
  secondaryActionTo?: string
  children?: ReactNode
  className?: string
}

export function EmptyState({
  icon = 'database',
  title,
  description,
  actionLabel,
  actionTo,
  secondaryActionLabel,
  secondaryActionTo,
  children,
  className = '',
}: EmptyStateProps) {
  return (
    <section
      className={[
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest px-6 py-10 text-center',
        className,
      ].join(' ')}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-container text-primary">
        <span aria-hidden="true" className="material-symbols-outlined text-[28px]">{icon}</span>
      </div>
      <h3 className="mt-4 font-headline-md text-headline-md text-on-surface">{title}</h3>
      <p className="mt-2 max-w-xl font-body-sm text-body-sm leading-6 text-on-surface-variant">
        {description}
      </p>
      {children ? (
        <div className="mt-4 w-full max-w-2xl">{children}</div>
      ) : null}
      {(actionLabel && actionTo) || (secondaryActionLabel && secondaryActionTo) ? (
        <div className="mt-5 flex flex-col items-stretch justify-center gap-2 sm:flex-row sm:items-center">
          {actionLabel && actionTo ? (
            <Link
              to={actionTo}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 font-body-sm text-body-sm text-on-primary shadow-sm transition-colors hover:bg-primary/90"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">arrow_forward</span>
              {actionLabel}
            </Link>
          ) : null}
          {secondaryActionLabel && secondaryActionTo ? (
            <Link
              to={secondaryActionTo}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-outline-variant bg-surface px-4 py-2 font-body-sm text-body-sm text-on-surface transition-colors hover:bg-surface-container-low"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">open_in_new</span>
              {secondaryActionLabel}
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
