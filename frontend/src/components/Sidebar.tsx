import { NavLink } from 'react-router-dom'

const navItems = [
  { path: '/',        label: '监控总览', icon: 'dashboard'            },
  { path: '/stations', label: '基站管理', icon: 'router'               },
  { path: '/faults',   label: '故障日志', icon: 'history_toggle_off'   },
  { path: '/map',      label: '故障地图', icon: 'map'                  },
  { path: '/metrics',  label: '模型评估', icon: 'analytics'            },
  { path: '/mobile-alert', label: '移动预警', icon: 'notifications_active' },
  { path: '/settings', label: '系统设置', icon: 'settings' },
]

export default function Sidebar() {
  return (
    <aside className="fixed bottom-0 left-0 top-0 z-40 hidden w-sidebar-width flex-col bg-inverse-surface py-4 text-white shadow-md md:flex dark-scrollbar">
      {/* ── Brand area ─────────────────────────────────── */}
      <div className="mb-8 px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-container">
            <span className="material-symbols-outlined text-on-primary-container text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              hub
            </span>
          </div>
          <div className="min-w-0">
            <h1 className="text-[18px] font-semibold leading-tight text-on-inverse-surface">
              智能运维平台
            </h1>
            <p className="mt-1 text-[11px] leading-none text-surface-variant">
              通信故障诊断系统
            </p>
          </div>
        </div>
        <p className="mt-3 text-[11px] font-medium text-surface-variant tracking-wide">
          AI 诊断引擎运行中
        </p>
      </div>

      {/* ── Navigation ─────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-2">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `mx-2 my-1 flex items-center gap-3 rounded-lg px-4 py-3 text-[13px] font-medium tracking-wide transition-all duration-200 ${
                isActive
                  ? 'bg-primary-container-dark text-on-primary-container-dark'
                  : 'text-surface-variant hover:text-white hover:bg-surface-container-highest/10'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className="material-symbols-outlined text-[20px] leading-none"
                  style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                >
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* ── Footer ─────────────────────────────────────── */}
      <div className="mt-auto border-t border-outline/30 px-2 pt-4">
        <button
          type="button"
          className="mx-2 my-1 flex w-[calc(100%-1rem)] items-center gap-3 rounded-lg px-4 py-3 text-left text-[13px] font-medium tracking-wide text-surface-variant transition-colors hover:bg-surface-container-highest/10 hover:text-white"
          title="演示顺序：总览、故障日志、地图、诊断建议、模型评估。"
        >
          <span className="material-symbols-outlined text-[20px] leading-none" style={{ fontVariationSettings: "'FILL' 0" }}>
            help
          </span>
          <span>帮助支持</span>
        </button>
        <button
          type="button"
          className="mx-2 my-1 flex w-[calc(100%-1rem)] cursor-not-allowed items-center gap-3 rounded-lg px-4 py-3 text-left text-[13px] font-medium tracking-wide text-surface-variant opacity-70"
          disabled
          title="本课程设计演示版未接入登录会话。"
        >
          <span className="material-symbols-outlined text-[20px] leading-none" style={{ fontVariationSettings: "'FILL' 0" }}>
            logout
          </span>
          <span>退出系统</span>
        </button>
      </div>
    </aside>
  )
}
