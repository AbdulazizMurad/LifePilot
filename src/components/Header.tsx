import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

function initials(name: string | null | undefined, email: string | undefined): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/)
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
  }
  return (email?.[0] ?? '?').toUpperCase()
}

export function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  const { profile, user } = useAuth()
  const navigate = useNavigate()
  return (
    <div className="hero">
      <div>
        <h1>{title}</h1>
        {subtitle && <div className="sub">{subtitle}</div>}
      </div>
      <button className="avatar" onClick={() => navigate('/settings')} aria-label="Settings">
        {initials(profile?.full_name, user?.email)}
      </button>
    </div>
  )
}

export function greeting(name?: string | null): string {
  const h = new Date().getHours()
  const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
  const first = name?.trim()?.split(/\s+/)[0]
  return first ? `${part}, ${first}` : part
}
