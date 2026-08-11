import { NavLink } from 'react-router-dom'
import { IconMonth, IconDay, IconNow, IconSparkle, IconLogo, IconSettings } from './ui/icons'

export const NAV_ITEMS = [
  { to: '/month', label: 'Month', Icon: IconMonth },
  { to: '/day', label: 'Day', Icon: IconDay },
  { to: '/now', label: 'Now', Icon: IconNow },
  { to: '/assistant', label: 'Pilot', Icon: IconSparkle },
] as const

/** Mobile: fixed bottom tab bar. Hidden on desktop (see CSS). */
export function BottomNav() {
  return (
    <nav className="bottom-nav">
      {NAV_ITEMS.map(({ to, label, Icon }) => (
        <NavLink key={to} to={to} className="nav-item" style={{ textDecoration: 'none' }}>
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

/** Desktop: fixed left rail. Hidden on mobile (see CSS). */
export function SideNav() {
  return (
    <aside className="side-nav">
      <div className="side-brand">
        <span className="side-logo">
          <IconLogo width={22} height={22} color="#fff" />
        </span>
        <span className="side-title">LifePilot</span>
      </div>
      <nav className="side-links">
        {NAV_ITEMS.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} className="side-link" style={{ textDecoration: 'none' }}>
            {({ isActive }) => (
              <span className="side-link" data-active={isActive}>
                <Icon width={20} height={20} />
                <span>{label}</span>
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      <NavLink to="/settings" className="side-link side-settings" style={{ textDecoration: 'none' }}>
        {({ isActive }) => (
          <span className="side-link" data-active={isActive}>
            <IconSettings width={20} height={20} />
            <span>Settings</span>
          </span>
        )}
      </NavLink>
    </aside>
  )
}
