import { NavLink } from 'react-router-dom'

const tabs = [
  { path: '/',        label: '总览',   icon: 'dashboard'    },
  { path: '/stations', label: '基站',  icon: 'router'       },
  { path: '/faults',   label: '故障',  icon: 'history_toggle_off' },
  { path: '/map',      label: '地图',  icon: 'map'          },
  { path: '/settings', label: '设置',  icon: 'settings'     },
]

export default function MobileNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-14 items-center justify-around border-t border-outline-variant bg-surface md:hidden">
      {tabs.map((tab) => (
        <NavLink
          key={tab.path}
          to={tab.path}
          end={tab.path === '/'}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 px-3 py-1 ${
              isActive ? 'text-primary' : 'text-on-surface-variant'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full ${
                  isActive ? 'bg-primary-container-dark text-on-primary-container-dark' : ''
                }`}
              >
                <span
                  className="material-symbols-outlined text-[20px]"
                  style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                >
                  {tab.icon}
                </span>
              </span>
              <span className="font-label-caps text-[10px] uppercase tracking-wider">
                {tab.label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
