import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { Field, TextInput } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { IconLogo } from '@/components/ui/icons'

export function AuthPage() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    setErr('')
    setMsg('')
    if (!email.trim() || !password) return setErr('Enter your email and password.')
    if (mode === 'up' && !fullName.trim()) return setErr('What should we call you?')
    if (mode === 'up' && password.length < 8)
      return setErr('Use at least 8 characters — longer passwords are much harder to guess.')
    setLoading(true)
    const res =
      mode === 'in'
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password, fullName.trim())
    setLoading(false)
    if (res.error) return setErr(res.error)
    if (mode === 'up') {
      setMsg('Account created! If email confirmation is on, check your inbox — otherwise you are in.')
    }
  }

  return (
    <div className="auth-wrap">
      <div className="col" style={{ gap: 14, alignItems: 'center', textAlign: 'center' }}>
        <div className="logo-mark">
          <IconLogo width={32} height={32} color="#fff" />
        </div>
        <div>
          <h1 style={{ fontSize: 30 }}>LifePilot</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            Your AI co-pilot for planning the day — it decides what to do first, what can wait, and
            reshuffles when life changes.
          </p>
        </div>
      </div>

      <div className="card stack">
        <div className="segmented">
          <button data-active={mode === 'in'} onClick={() => setMode('in')}>
            Sign in
          </button>
          <button data-active={mode === 'up'} onClick={() => setMode('up')}>
            Create account
          </button>
        </div>

        {mode === 'up' && (
          <Field label="Your name">
            <TextInput
              placeholder="e.g. Abdulaziz"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </Field>
        )}
        <Field label="Email">
          <TextInput
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password">
          <TextInput
            type="password"
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </Field>

        {err && <div className="error-text">{err}</div>}
        {msg && <div className="tiny" style={{ color: 'var(--success)' }}>{msg}</div>}

        <Button variant="primary" block loading={loading} onClick={submit}>
          {mode === 'in' ? 'Sign in' : 'Create my account'}
        </Button>
      </div>

      <p className="tiny dim" style={{ textAlign: 'center' }}>
        Your data is private and secured with row-level security. The AI only helps organize your
        tasks.
      </p>
    </div>
  )
}
