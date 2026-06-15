import { Outlet } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import MobileNav from './components/MobileNav'

export default function App() {
  return (
    <div className="flex min-h-screen bg-surface text-on-surface">
      {/* ── Fixed sidebar (desktop only) ──────────────── */}
      <Sidebar />

      {/* ── Main content wrapper ──────────────────────── */}
      <div className="flex-1 md:ml-sidebar-width flex flex-col min-h-screen">
        {/* ── Fixed header ───────────────────────────── */}
        <Header />

        {/* ── Main canvas ────────────────────────────── */}
        <main className="flex-1 mt-header-height p-gutter overflow-y-auto pb-16 md:pb-0">
          <Outlet />
        </main>
      </div>

      {/* ── Mobile bottom nav ─────────────────────────── */}
      <MobileNav />
    </div>
  )
}
