import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '@/context/DataContext'
import { Header } from '@/components/Header'
import { Button } from '@/components/ui/Button'
import { TaskCard } from '@/components/TaskCard'
import { useState } from 'react'
import { TaskEditSheet } from '@/components/EditSheets'
import type { Task } from '@/lib/types'
import { pickNow, sortByUrgency } from '@/lib/scheduler'
import { durationLabel, isSameDay, parseISO, fmtTime } from '@/lib/date'
import { PRIORITY_META, CATEGORY_EMOJI } from '@/lib/ui'
import { IconCheck, IconNow, IconSparkle } from '@/components/ui/icons'

export function NowPage() {
  const { tasks, events, toggleDone, updateTask } = useData()
  const navigate = useNavigate()
  const [editTask, setEditTask] = useState<Task | null>(null)

  const now = new Date()
  const active = useMemo(() => tasks.filter((t) => t.status !== 'done'), [tasks])
  const current = useMemo(() => pickNow(active, now), [active])

  const upNext = useMemo(
    () => sortByUrgency(active, now).filter((t) => t.id !== current?.id).slice(0, 4),
    [active, current],
  )

  // Today's progress = what you finished today, over that plus what is still
  // outstanding. Counting only dated tasks left the ring stuck at 0% for
  // anything unscheduled, and measuring only finished work made the total
  // shrink as you went, so one of two tasks read as 100%.
  const { done, total, pct } = useMemo(() => {
    const finishedToday = tasks.filter(
      (t) => t.status === 'done' && t.completed_at && isSameDay(parseISO(t.completed_at), now),
    )
    const plannedToday = active.filter((t) => {
      const ref = t.scheduled_start ?? t.deadline
      return ref && isSameDay(parseISO(ref), now)
    })
    // With nothing scheduled for today, the whole open backlog is "today's work".
    const outstanding = plannedToday.length ? plannedToday : active
    const totalCount = finishedToday.length + outstanding.length
    return {
      done: finishedToday.length,
      total: totalCount,
      pct: totalCount ? Math.round((finishedToday.length / totalCount) * 100) : 0,
    }
  }, [tasks, active])

  const nextEvent = useMemo(
    () =>
      events
        .filter((e) => parseISO(e.start_at) > now)
        .sort((a, b) => a.start_at.localeCompare(b.start_at))[0],
    [events],
  )

  return (
    <div className="page">
      <Header title="Right now" subtitle="One thing at a time" />

      {current ? (
        <div className="now-card">
          <div className="label">
            <span className="pulse" /> Focus on this
          </div>
          <h2>
            {CATEGORY_EMOJI[current.category] ?? '📌'} {current.title}
          </h2>
          <div className="row wrap" style={{ gap: 8, marginBottom: 6 }}>
            <span className="meta-pill">{durationLabel(current.duration_minutes)}</span>
            <span className="meta-pill" style={{ color: PRIORITY_META[current.priority].color }}>
              {PRIORITY_META[current.priority].short}
            </span>
            {current.scheduled_start && (
              <span className="meta-pill" style={{ color: 'var(--accent)' }}>
                {fmtTime(current.scheduled_start)}
              </span>
            )}
          </div>
          {current.ai_reason && <p className="tiny muted" style={{ fontStyle: 'italic' }}>✨ {current.ai_reason}</p>}
          {current.notes && <p className="small muted" style={{ marginTop: 8 }}>{current.notes}</p>}

          <div className="row" style={{ gap: 10, marginTop: 18 }}>
            {current.status !== 'in_progress' && (
              <Button
                variant="soft"
                className="grow"
                onClick={() => updateTask(current.id, { status: 'in_progress' })}
              >
                Start
              </Button>
            )}
            <Button variant="primary" className="grow" onClick={() => toggleDone(current)}>
              <IconCheck width={18} height={18} /> Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="now-card center" style={{ flexDirection: 'column', textAlign: 'center', gap: 6 }}>
          <IconNow width={34} height={34} color="var(--accent)" />
          {tasks.length === 0 ? (
            <>
              <h2 style={{ margin: '8px 0 0' }}>Let's fill your day</h2>
              <p className="muted">
                Tell LifePilot what's on your plate and it will schedule it around your week.
              </p>
              <Button variant="soft" style={{ marginTop: 12 }} onClick={() => navigate('/assistant')}>
                <IconSparkle width={18} height={18} /> Talk to your Pilot
              </Button>
            </>
          ) : (
            <>
              <h2 style={{ margin: '8px 0 0' }}>All clear 🎉</h2>
              <p className="muted">Everything's done. Enjoy the break.</p>
            </>
          )}
        </div>
      )}

      {/* progress + next event */}
      <div className="row" style={{ gap: 12, marginTop: 16 }}>
        <div className="card grow row" style={{ gap: 14, alignItems: 'center' }}>
          <div className="ring" style={{ ['--p' as string]: pct, position: 'relative' }}>
            <span>{pct}%</span>
          </div>
          <div>
            <strong style={{ fontSize: 15 }}>Today</strong>
            <div className="tiny muted">
              {total ? `${done}/${total} done` : 'Nothing planned yet'}
            </div>
          </div>
        </div>
        {nextEvent && (
          <div className="card grow">
            <div className="tiny dim">Next commitment</div>
            <strong style={{ fontSize: 15, display: 'block', marginTop: 4 }}>{nextEvent.title}</strong>
            <div className="tiny muted" style={{ marginTop: 2 }}>
              {isSameDay(parseISO(nextEvent.start_at), now) ? fmtTime(nextEvent.start_at) : parseISO(nextEvent.start_at).toLocaleDateString()}
            </div>
          </div>
        )}
      </div>

      {upNext.length > 0 && (
        <>
          <div className="section-title">Up next</div>
          <div className="stack">
            {upNext.map((t) => (
              <TaskCard key={t.id} task={t} onToggle={toggleDone} onOpen={setEditTask} showSchedule />
            ))}
          </div>
        </>
      )}

      <TaskEditSheet task={editTask} onClose={() => setEditTask(null)} />
    </div>
  )
}
