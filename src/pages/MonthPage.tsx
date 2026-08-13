import { useMemo, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useData } from '@/context/DataContext'
import { Header, greeting } from '@/components/Header'
import { CalendarMonth } from '@/components/CalendarMonth'
import { TaskCard } from '@/components/TaskCard'
import { TaskEditSheet, EventEditSheet } from '@/components/EditSheets'
import type { Task, EventItem } from '@/lib/types'
import { fmtDayLabel, fmtTime, isSameDay, parseISO } from '@/lib/date'
import { sortByUrgency } from '@/lib/scheduler'
import { IconPin } from '@/components/ui/icons'

export function MonthPage() {
  const { profile } = useAuth()
  const { tasks, events, toggleDone } = useData()
  const [anchor, setAnchor] = useState(new Date())
  const [selected, setSelected] = useState(new Date())
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [editEvent, setEditEvent] = useState<EventItem | null>(null)

  const dayTasks = useMemo(
    () =>
      sortByUrgency(
        tasks.filter((t) => {
          const ref = t.scheduled_start ?? t.deadline
          return ref && isSameDay(parseISO(ref), selected)
        }),
      ),
    [tasks, selected],
  )
  const dayEvents = useMemo(
    () => events.filter((e) => isSameDay(parseISO(e.start_at), selected)).sort((a, b) => a.start_at.localeCompare(b.start_at)),
    [events, selected],
  )

  return (
    <div className="page">
      <Header title={greeting(profile?.full_name)} subtitle="Here’s your month at a glance" />

      <CalendarMonth
        anchor={anchor}
        selected={selected}
        tasks={tasks}
        events={events}
        profile={profile}
        onSelect={setSelected}
        onAnchorChange={setAnchor}
      />

      <div className="section-title">{fmtDayLabel(selected)}</div>

      {dayEvents.length === 0 && dayTasks.length === 0 && (
        <div className="empty">
          <div className="emoji">✨</div>
          <p>Nothing scheduled here.</p>
          <p className="tiny">Tap + to add a task or commitment.</p>
        </div>
      )}

      <div className="stack">
        {dayEvents.map((e) => (
          <div
            key={e.id}
            className="card"
            style={{ padding: 12, borderLeft: '4px solid var(--accent)', cursor: 'pointer' }}
            onClick={() => setEditEvent(e)}
          >
            <div className="between">
              <strong style={{ fontSize: 15 }}>{e.title}</strong>
              <span className="tiny dim">
                {fmtTime(e.start_at)}–{fmtTime(e.end_at)}
              </span>
            </div>
            {e.location && (
              <div className="tiny muted row" style={{ gap: 4, marginTop: 4 }}>
                <IconPin width={12} height={12} /> {e.location}
              </div>
            )}
          </div>
        ))}
        {dayTasks.map((t) => (
          <TaskCard key={t.id} task={t} onToggle={toggleDone} onOpen={setEditTask} showSchedule />
        ))}
      </div>

      <TaskEditSheet task={editTask} onClose={() => setEditTask(null)} />
      <EventEditSheet event={editEvent} onClose={() => setEditEvent(null)} />
    </div>
  )
}
