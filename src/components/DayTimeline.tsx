import type { EventItem, Task } from '@/lib/types'
import type { PlannedBlock } from '@/lib/scheduler'
import { fmtTime, isSameDay } from '@/lib/date'
import { CATEGORY_EMOJI, PRIORITY_META } from '@/lib/ui'
import { IconPin } from './ui/icons'

interface Props {
  day: Date
  events: EventItem[]
  blocks: PlannedBlock[]
  onOpenTask: (t: Task) => void
  onOpenEvent: (e: EventItem) => void
}

type Row =
  | { kind: 'event'; start: Date; end: Date; ev: EventItem }
  | { kind: 'task'; start: Date; end: Date; block: PlannedBlock }

export function DayTimeline({ day, events, blocks, onOpenTask, onOpenEvent }: Props) {
  const rows: Row[] = [
    ...events.map((ev) => ({ kind: 'event' as const, start: new Date(ev.start_at), end: new Date(ev.end_at), ev })),
    ...blocks.map((block) => ({ kind: 'task' as const, start: block.start, end: block.end, block })),
  ].sort((a, b) => a.start.getTime() - b.start.getTime())

  const now = new Date()
  const showNow = isSameDay(day, now)

  if (rows.length === 0) {
    return (
      <div className="empty">
        <div className="emoji">🗓️</div>
        <p>Nothing planned yet for this day.</p>
        <p className="tiny">Add tasks or tap “Plan my day”.</p>
      </div>
    )
  }

  let nowInserted = false

  return (
    <div className="timeline">
      {rows.map((r, i) => {
        const insertNow = showNow && !nowInserted && r.start > now
        if (insertNow) nowInserted = true
        return (
          <div key={i}>
            {insertNow && (
              <div className="tl-row tl-now-row">
                <span className="tl-time" style={{ color: 'var(--accent)' }}>
                  {fmtTime(now)}
                </span>
                <div className="tl-now" />
              </div>
            )}
            <div className="tl-row">
              <span className="tl-time">{fmtTime(r.start)}</span>
              {r.kind === 'event' ? (
                <div
                  className="card"
                  style={{ padding: 12, borderLeft: '4px solid var(--accent)', cursor: 'pointer' }}
                  onClick={() => onOpenEvent(r.ev)}
                >
                  <div className="between">
                    <strong style={{ fontSize: 15 }}>{r.ev.title}</strong>
                    <span className="tiny dim">
                      {fmtTime(r.start)}–{fmtTime(r.end)}
                    </span>
                  </div>
                  {r.ev.location && (
                    <div className="tiny muted row" style={{ gap: 4, marginTop: 4 }}>
                      <IconPin width={12} height={12} /> {r.ev.location}
                    </div>
                  )}
                  <span className="badge" style={{ background: 'rgba(34,211,238,0.15)', color: 'var(--accent)', marginTop: 8 }}>
                    Fixed
                  </span>
                </div>
              ) : (
                <div
                  className="card"
                  style={{ padding: 12, borderLeft: `4px solid ${PRIORITY_META[r.block.task.priority].color}`, cursor: 'pointer' }}
                  onClick={() => onOpenTask(r.block.task)}
                >
                  <div className="between">
                    <strong style={{ fontSize: 15 }}>
                      {CATEGORY_EMOJI[r.block.task.category] ?? '📌'} {r.block.task.title}
                    </strong>
                    <span className="tiny dim">
                      {fmtTime(r.start)}–{fmtTime(r.end)}
                    </span>
                  </div>
                  <div className="tiny dim" style={{ marginTop: 4, fontStyle: 'italic' }}>
                    {r.block.reason}
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
