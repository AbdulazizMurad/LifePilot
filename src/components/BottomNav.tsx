import { NavLink } from 'react-router-dom'
import { IconMonth, IconDay, IconNow, IconSparkle } from './ui/icons'

const items = [
  { to: '/month', label: 'Month', Icon: IconMonth },
  { to: '/day', label: 'Day', Icon: IconDay },
  { to: '/now', label: 'Now', Icon: IconNow },
  { to: '/assistant', label: 'Pilot', Icon: IconSparkle },
]

export function BottomNav() {
  return (
    <nav className="bottom-nav">
      {items.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className="nav-item"
          style={{ textDecoration: 'none' }}
        >
          {({ isActive }) => (
            <span className="nav-item" data-active={isActive} style={{ height: '100%', color: 'inherit' }}>
              <Icon />
              <span>{label}</span>
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
