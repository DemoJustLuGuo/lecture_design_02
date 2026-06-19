import { Link } from 'react-router-dom'

interface BreadcrumbItem {
  label: string
  path?: string
}

interface BreadcrumbNavProps {
  items: BreadcrumbItem[]
}

export function BreadcrumbNav({ items }: BreadcrumbNavProps) {
  return (
    <nav className="flex items-center gap-2 font-body-sm text-on-surface-variant" aria-label="面包屑导航">
      {items.map((item, index) => {
        const isLast = index === items.length - 1

        return (
          <span key={`${item.label}-${index}`} className="flex items-center gap-2">
            {/* Breadcrumb item */}
            {isLast ? (
              <span className="text-on-surface font-label-md">{item.label}</span>
            ) : item.path ? (
              <Link
                to={item.path}
                className="transition-colors hover:text-primary"
              >
                {item.label}
              </Link>
            ) : (
              <span>{item.label}</span>
            )}

            {/* Separator icon */}
            {!isLast && (
              <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-on-surface-variant">
                chevron_right
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
