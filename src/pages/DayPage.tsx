import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useData } from '@/context/DataContext'
import { Header } from '@/components/Header'
import { DayTimeline } from '@/components/DayTimeline'
import { TaskCard } from '@/components/TaskCard'
import { TaskEditSheet, EventEditSheet } from '@/components/EditSheets'
import { Button } from '@/components/ui/Button'
import type { Task, EventItem } from '@/lib/types'
import type { PlannedBlock } from '@/lib/scheduler'
import { planDay, sortByUrgency } from '@/lib/scheduler'
import { fmtDayLabel, isSameDay, parseISO, format } from '@/lib/date'
import { IconChevronL, IconChevronR, IconSparkle } from '@/components/ui/icons'

export function DayPage() {
  const { profile } = useAuth()
  const { tasks, events, updateTask, toggleDone } = useData()
  const location = useLocation()
  const initialDate = (location.state as { date?: string } | null)?.date
  const [day, setDay] = useState(initialDate ? new Date(initialDate) : new Date())

  // Allow other screens (e.g. the AI applying a plan) to open a specific day.
  useEffect(() => {
    const d = (location.state as { date?: string } | null)?.date
    if (d) setDay(new Date(d))
  }, [location.state])
  const [planning, setPlanning] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [editEvent, setEditEvent] = useState<EventItem | null>(null)

  const dayEvents = useMemo(
    () => events.filter((e) => isSameDay(parseISO(e.start_at), day)),
    [events, day],
  )

  // Tasks already scheduled onto this day become timeline blocks.
  const scheduledBlocks: PlannedBlock[] = useMemo(
    () =>
      tasks
        .filter(
          (t) =>
            t.status !== 'done' &&
            t.scheduled_start &&
            t.scheduled_end &&
            isSameDay(parseISO(t.scheduled_start), day),
        )
        .map((t) => ({
          task: t,
          start: parseISO(t.scheduled_start!),
          end: parseISO(t.scheduled_end!),
          reason: t.ai_reason ?? 'Scheduled',
        })),
    [tasks, day],
  )

  // Backlog = not done, not scheduled anywhere.
  const backlog = useMemo(
    () => sortByUrgency(tasks.filter((t) => t.status !== 'done' && !t.scheduled_start)),
    [tasks],
  )

  const autoPlan = async () => {
    setPlanning(true)
    const candidates = tasks.filter((t) => t.status !== 'done' && !t.scheduled_start)
    const { blocks } = planDay(day, candidates, profile, dayEvents)
    await Promise.all(
      blocks.map((b) =>
        updateTask(b.task.id, {
          scheduled_start: b.start.toISOString(),
          scheduled_end: b.end.toISOString(),
          status: 'scheduled',
          ai_reason: b.reason,
        }),
      ),
    )
    setPlanning(false)
  }

  const clearPlan = async () => {
    await Promise.all(
      scheduledBlocks.map((b) =>
        updateTask(b.task.id, { scheduled_start: null, scheduled_end: null, status: 'todo', ai_reason: null }),
      ),
    )
  }

  const shift = (delta: number) => {
    const d = new Date(day)
    d.setDate(d.getDate() + delta)
    setDay(d)
  }

  return (
    <div className="page">
      <Header title={fmtDayLabel(day)} subtitle={format(day, 'EEEE, MMMM d')} />

      <div className="between" style={{ marginBottom: 14 }}>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn--icon btn--ghost" onClick={() => shift(-1)} aria-label="Previous day">
            <IconChevronL width={18} height={18} />
          </button>
          <button className="btn btn--sm btn--soft" onClick={() => setDay(new Date())}>
            Today
          </button>
          <button className="btn btn--icon btn--ghost" onClick={() => shift(1)} aria-label="Next day">
            <IconChevronR width={18} height={18} />
          </button>
        </div>
        {scheduledBlocks.length > 0 ? (
          <button className="btn btn--sm btn--ghost" onClick={clearPlan}>
            Clear plan
          </button>
        ) : (
          <Button size="sm" variant="primary" onClick={autoPlan} loading={planning}>
            <IconSparkle width={16} height={16} /> Plan my day
          </Button>
        )}
      </div>

      <DayTimeline
        day={day}
        events={dayEvents}
        blocks={scheduledBlocks}
        profile={profile}
        onOpenTask={setEditTask}
        onOpenEvent={setEditEvent}
      />

      {backlog.length > 0 && (
        <>
          <div className="section-title">Backlog · {backlog.length}</div>
          <p className="tiny dim" style={{ margin: '0 2px 10px' }}>
            Unscheduled tasks. Tap “Plan my day” to fit them into your free time.
          </p>
          <div className="stack">
            {backlog.map((t) => (
              <TaskCard key={t.id} task={t} onToggle={toggleDone} onOpen={setEditTask} />
            ))}
          </div>
        </>
      )}

      <TaskEditSheet task={editTask} onClose={() => setEditTask(null)} />
      <EventEditSheet event={editEvent} onClose={() => setEditEvent(null)} />
    </div>
  )
}
