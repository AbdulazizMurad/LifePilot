import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useData } from '@/context/DataContext'
import { Header } from '@/components/Header'
import { Button } from '@/components/ui/Button'
import { organize, planDayWithAI } from '@/lib/ai'
import type { OrganizerResult } from '@/lib/types'
import { IconSend, IconSparkle } from '@/components/ui/icons'
import { fmtTime, format } from '@/lib/date'

interface Msg {
  role: 'user' | 'assistant'
  content: string
}

const SUGGESTIONS = [
  'Plan my day',
  'What should I focus on first?',
  'I only have 2 free hours tonight — what should I do?',
  'Reorganize around a new deadline',
]

export function AssistantPage() {
  const { profile } = useAuth()
  const { tasks, events, updateTask } = useData()
  const navigate = useNavigate()
  const [log, setLog] = useState<Msg[]>([
    {
      role: 'assistant',
      content:
        "Hi! I'm your LifePilot organizer. Tell me what's on your plate and I'll help you decide what to do first, what can wait, and build a realistic plan. I only help with organizing your tasks and schedule.",
    },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [proposal, setProposal] = useState<OrganizerResult | null>(null)
  const [err, setErr] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const scrollDown = () =>
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 9e9, behavior: 'smooth' }))

  const send = async (text: string) => {
    const message = text.trim()
    if (!message || busy) return
    setErr('')
    setInput('')
    setLog((l) => [...l, { role: 'user', content: message }])
    scrollDown()
    setBusy(true)
    const history = log.slice(-6).map((m) => ({ role: m.role, content: m.content }))
    const res = await organize({ mode: 'chat', message, profile, tasks, events, history })
    setBusy(false)
    if (!res.ok) {
      setErr(res.error || 'Something went wrong reaching the organizer.')
      return
    }
    setLog((l) => [...l, { role: 'assistant', content: res.reply }])
    if (res.result?.blocks?.length) setProposal(res.result)
    scrollDown()
  }

  const planToday = async () => {
    if (busy) return
    setErr('')
    setBusy(true)
    setLog((l) => [...l, { role: 'user', content: 'Plan my day' }])
    scrollDown()
    const res = await planDayWithAI(new Date(), profile, tasks, events)
    setBusy(false)
    if (!res.ok) {
      setErr(res.error || 'Could not build a plan right now.')
      return
    }
    setLog((l) => [...l, { role: 'assistant', content: res.reply }])
    if (res.result?.blocks?.length) setProposal(res.result)
    scrollDown()
  }

  const applyProposal = async () => {
    if (!proposal || !proposal.blocks.length) return
    const blocks = proposal.blocks
    await Promise.all(
      blocks.map((b) =>
        updateTask(b.task_id, {
          scheduled_start: b.start,
          scheduled_end: b.end,
          status: 'scheduled',
          ai_reason: b.reason,
        }),
      ),
    )
    setProposal(null)
    const firstDay = new Date(blocks[0].start)
    const dayLabel = format(firstDay, 'EEE, MMM d')
    setLog((l) => [
      ...l,
      { role: 'assistant', content: `✅ Added ${blocks.length} block${blocks.length > 1 ? 's' : ''} to ${dayLabel}. Opening your Day view…` },
    ])
    scrollDown()
    // Jump straight to that day so the user sees it on the calendar.
    setTimeout(() => navigate('/day', { state: { date: firstDay.toISOString() } }), 700)
  }

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <Header title="LifePilot AI" subtitle="Your personal day organizer" />

      <div ref={scrollRef} className="ai-log grow" style={{ overflowY: 'auto', paddingBottom: 12 }}>
        {log.map((m, i) => (
          <div key={i} className={`ai-bubble ${m.role === 'user' ? 'user' : 'bot'}`}>
            {m.content}
          </div>
        ))}

        {proposal && (
          <div className="ai-suggest">
            <div className="row" style={{ gap: 6, marginBottom: 8 }}>
              <IconSparkle width={16} height={16} color="var(--brand-ink)" />
              <strong>Proposed plan</strong>
            </div>
            <div className="stack" style={{ marginBottom: 10 }}>
              {proposal.blocks.map((b, i) => (
                <div key={i} className="col" style={{ gap: 2 }}>
                  <div className="between tiny" style={{ gap: 8 }}>
                    <span style={{ color: 'var(--accent)', minWidth: 96 }}>
                      {format(new Date(b.start), 'EEE')} · {fmtTime(b.start)}–{fmtTime(b.end)}
                    </span>
                    <span className="grow" style={{ fontWeight: 600 }}>{b.title}</span>
                  </div>
                  {b.reason && <span className="tiny dim" style={{ paddingLeft: 4 }}>{b.reason}</span>}
                </div>
              ))}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <Button size="sm" variant="ghost" className="grow" onClick={() => setProposal(null)}>
                Dismiss
              </Button>
              <Button size="sm" variant="primary" className="grow" onClick={applyProposal}>
                Apply plan
              </Button>
            </div>
          </div>
        )}

        {busy && (
          <div className="ai-bubble bot row" style={{ gap: 8 }}>
            <span className="spinner" style={{ borderTopColor: 'var(--brand-ink)' }} /> Thinking…
          </div>
        )}
        {err && <div className="error-text">{err}</div>}
      </div>

      {log.length <= 1 && (
        <div className="row wrap" style={{ gap: 8, margin: '8px 0' }}>
          {SUGGESTIONS.map((s) => (
            <button key={s} className="chip" onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="row" style={{ gap: 8, position: 'sticky', bottom: 0, paddingBottom: 8, background: 'transparent' }}>
        <button className="btn btn--soft btn--icon" onClick={planToday} aria-label="Plan my day" title="Plan my day">
          <IconSparkle width={20} height={20} />
        </button>
        <input
          className="input grow"
          placeholder="Ask about your tasks…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send(input)}
        />
        <button className="btn btn--primary btn--icon" onClick={() => send(input)} aria-label="Send" disabled={busy}>
          <IconSend width={20} height={20} />
        </button>
      </div>
    </div>
  )
}
