import { NavLink, Outlet } from 'react-router-dom'
import clsx from 'clsx'

const NAV_ITEMS = [
  { to: '/',        icon: '🏠', label: 'Inicio'   },
  { to: '/teams',   icon: '👥', label: 'Equipos'  },
  { to: '/matches', icon: '🤾', label: 'Partidos' },
]

export function Layout() {
  return (
    <div className="min-h-screen bg-court-bg text-white flex flex-col">
      <main className="flex-1 pb-16 overflow-y-auto">
        <Outlet />
      </main>
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-court-surface border-t border-white/10
                      flex justify-around items-center h-16">
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => clsx(
              'flex flex-col items-center gap-0.5 px-4 py-1 rounded-xl transition-all',
              isActive ? 'text-brand-secondary' : 'text-gray-500',
            )}
          >
            <span className="text-xl">{item.icon}</span>
            <span className="text-xs font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
