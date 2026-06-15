<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const searchQuery = ref('')

const navItems = [
  { path: '/', label: 'Dashboard', icon: 'dashboard' },
  { path: '/stations', label: 'Stations', icon: 'stations' },
  { path: '/faults', label: 'Faults', icon: 'faults' },
  { path: '/map', label: 'Map', icon: 'map' },
  { path: '/metrics', label: 'Metrics', icon: 'metrics' },
  { path: '/mobile-alert', label: 'Mobile Alert', icon: 'alert' },
]

const isActive = (path: string) => {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

const navClass = (path: string) => {
  const base = 'relative mx-2 my-1 flex items-center gap-3 rounded-lg px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.05em] transition-all duration-200'
  return isActive(path)
    ? `${base} bg-[#3a30cd] text-[#b9b7ff]`
    : `${base} text-[#e4e1ed] hover:bg-white/10 hover:text-white`
}

const currentTitle = computed(() => {
  return (route.meta.title as string) || '监控总览'
})
</script>

<template>
  <div class="flex h-screen w-screen overflow-hidden bg-[#fcf8ff] text-[#1b1b24]">
    <!-- Sidebar -->
    <aside class="flex w-[260px] shrink-0 flex-col bg-[#302f39] py-4 text-white shadow-md">
      <!-- Brand area -->
      <div class="mb-8 px-6">
        <div class="text-[30px] font-bold leading-[38px] tracking-[-0.02em]">Network</div>
        <div class="text-[30px] font-bold leading-[38px] tracking-[-0.02em]">Operations</div>
        <div class="mt-1 text-[11px] font-semibold uppercase leading-4 tracking-[0.05em] text-[#e4e1ed]">
          AI Diagnosis Active
        </div>
      </div>

      <!-- Navigation menu -->
      <nav class="flex-1 overflow-y-auto px-2">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          :class="navClass(item.path)"
        >
          <!-- Dashboard icon -->
          <svg v-if="item.icon === 'dashboard'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>

          <!-- Stations icon -->
          <svg v-if="item.icon === 'stations'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
            <path d="M4.976 9.828a6 6 0 0 1 14.048 0" />
            <path d="M2.146 6.146a10 10 0 0 1 19.708 0" />
            <path d="M12 18 L12 22" />
            <path d="M8 22 L16 22" />
          </svg>

          <!-- Faults icon -->
          <svg v-if="item.icon === 'faults'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <path d="M12 9 L12 13" />
            <path d="M12 17 L12.01 17" />
          </svg>

          <!-- Map icon -->
          <svg v-if="item.icon === 'map'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
            <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
            <path d="M8 2 L8 18" />
            <path d="M16 6 L16 22" />
          </svg>

          <!-- Metrics icon -->
          <svg v-if="item.icon === 'metrics'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
            <path d="M18 20 L18 10" />
            <path d="M12 20 L12 4" />
            <path d="M6 20 L6 14" />
          </svg>

          <!-- Alert icon -->
          <svg v-if="item.icon === 'alert'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            <path d="M10 8 L10 10" />
            <path d="M14 8 L14 10" />
          </svg>

          <span>{{ item.label }}</span>
        </router-link>
      </nav>

      <!-- Bottom links -->
      <div class="mt-auto border-t border-[#5d5f5f]/30 px-2 pt-4">
        <a href="#" class="mx-2 my-1 flex items-center gap-3 rounded-lg px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#e4e1ed] transition-colors hover:bg-white/10 hover:text-white">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <path d="M12 17 L12.01 17" />
          </svg>
          Support
        </a>
        <a href="#" class="mx-2 my-1 flex items-center gap-3 rounded-lg px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#e4e1ed] transition-colors hover:bg-white/10 hover:text-white">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <path d="M21 12 L9 12" />
          </svg>
          Sign Out
        </a>
      </div>
    </aside>

    <!-- Main content area -->
    <div class="flex flex-col flex-1 min-w-0">
      <!-- Top status bar -->
      <header class="flex h-[64px] shrink-0 items-center justify-between border-b border-[#c7c4d8] bg-[#fcf8ff] px-6 text-[14px] leading-5">
        <h1 class="sr-only">{{ currentTitle }}</h1>

        <div class="flex flex-1 items-center">
          <!-- Search -->
          <div class="relative hidden w-96 sm:block">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21 L16.65 16.65" />
            </svg>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="搜索节点、IP或告警..."
              class="h-10 w-full rounded-md border border-[#c7c4d8] bg-white pl-9 pr-4 text-[13px] font-medium text-[#464555] outline-none transition-all placeholder:text-[#777586] focus:border-[#1f00b7] focus:ring-2 focus:ring-[#1f00b7]/20"
            />
          </div>
        </div>

        <div class="flex items-center gap-4">

          <!-- Alert bell -->
          <button class="relative flex h-10 w-10 items-center justify-center rounded-full text-[#464555] transition-colors hover:bg-[#f0ecf9]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-[18px] h-[18px] text-slate-500">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span class="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500"></span>
          </button>

          <!-- Settings -->
          <button class="flex h-10 w-10 items-center justify-center rounded-full text-[#464555] transition-colors hover:bg-[#f0ecf9]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-[18px] h-[18px] text-slate-500">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82-.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>

          <button class="hidden h-10 w-10 items-center justify-center rounded-full text-[#464555] transition-colors hover:bg-[#f0ecf9] sm:flex">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-[18px] h-[18px]">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <path d="M12 17 L12.01 17" />
            </svg>
          </button>

          <!-- Divider -->
          <div class="hidden h-8 w-px bg-[#c7c4d8] sm:block"></div>

          <!-- User avatar -->
          <div class="flex items-center gap-3">
            <div class="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-[#3a30cd] text-[11px] font-semibold text-[#b9b7ff]">管</div>
          </div>
        </div>
      </header>

      <!-- Content area -->
      <main class="flex-1 overflow-y-auto bg-[#fcf8ff] p-6">
        <slot />
      </main>
    </div>
  </div>
</template>
