import { Outlet } from 'react-router-dom'
import { useLocation } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import MobileNav from './components/MobileNav'

export default function App() {
  const { pathname } = useLocation()
  const isMapCanvas = pathname === '/map'

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-surface text-on-surface">
      {/* ── Fixed sidebar (desktop only) ──────────────── */}
      <Sidebar />

      {/* ── Main content wrapper ──────────────────────── */}
      <div className="flex h-[100dvh] min-h-0 flex-1 flex-col md:ml-sidebar-width">
        {/* ── Fixed header ───────────────────────────── */}
        <Header />

        {/* ── Main canvas ────────────────────────────── */}
        <main
          className={[
            'mt-header-height min-h-0',
            isMapCanvas
              ? 'overflow-hidden p-0'
              : 'overflow-y-auto p-gutter pb-24 md:pb-0',
          ].join(' ')}
          style={{ height: 'calc(100dvh - var(--spacing-header-height))' }}
        >
          <Outlet />
        </main>
      </div>

      {/* ── Mobile bottom nav ─────────────────────────── */}
      <MobileNav />
    </div>
  )
}
