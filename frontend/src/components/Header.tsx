import { useState } from 'react'

export default function Header() {
  const [searchQuery, setSearchQuery] = useState('')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <header className="fixed left-0 right-0 top-0 z-30 flex h-header-height items-center justify-between border-b border-outline-variant bg-surface px-6 md:left-sidebar-width">
      {/* ── Left side ─────────────────────────────────── */}
      <div className="flex flex-1 items-center gap-4">
        {/* Mobile brand */}
        <span className="font-title-md text-on-surface md:hidden">
          NetPulse AI-Core
        </span>

        {/* Search bar – hidden on mobile, visible from sm */}
        <div className="relative hidden w-96 sm:block">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索节点、IP或告警..."
            className="h-10 w-full rounded-md border border-outline-variant bg-surface-container-lowest pl-9 pr-4 font-data-mono text-on-surface-variant outline-none transition-all placeholder:text-on-surface-variant/60 focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* ── Right side ────────────────────────────────── */}
      <div className="flex items-center gap-4 text-on-surface-variant">
        {/* Notifications */}
        <button
          type="button"
          aria-label="通知"
          className="relative flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-surface-container"
        >
          <span className="material-symbols-outlined text-[20px]">notifications</span>
          <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-error animate-pulse-scale border border-surface" />
        </button>

        {/* Settings */}
        <button
          type="button"
          aria-label="设置"
          className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-surface-container"
        >
          <span className="material-symbols-outlined text-[20px]">settings</span>
        </button>

        {/* Help – hidden on mobile */}
        <button
          type="button"
          aria-label="帮助"
          className="hidden h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-surface-container sm:flex"
        >
          <span className="material-symbols-outlined text-[20px]">help</span>
        </button>

        {/* Divider */}
        <div className="hidden h-8 w-px bg-outline-variant sm:block" />

        {/* User avatar */}
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-container-dark text-on-primary-container-dark font-label-md">
          <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
        </div>
      </div>

      {/* ── Mobile hamburger ───────────────────────────── */}
      <button
        type="button"
        aria-label="菜单"
        className="ml-2 flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container md:hidden"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
      >
        <span className="material-symbols-outlined text-[22px]">
          {mobileMenuOpen ? 'close' : 'menu'}
        </span>
      </button>
    </header>
  )
}
