import type { EventItem, Task, Profile } from '@/lib/types'
import type { PlannedBlock } from '@/lib/scheduler'
import { fmtTime, isSameDay, atTime } from '@/lib/date'
import { CATEGORY_EMOJI, PRIORITY_META } from '@/lib/ui'
import { IconPin } from './ui/icons'

interface Props {
  day: Date
  events: EventItem[]
  blocks: PlannedBlock[]
  profile?: Profile | null
  onOpenTask: (t: Task) => void
  onOpenEvent: (e: EventItem) => void
}

/**
 * Work and study hours are derived from the profile rather than stored as
 * events: change your hours once and every day updates, with nothing to
 * accidentally delete and no duplicated rows in the database.
 */
function routineRows(day: Date, profile?: Profile | null) {
  if (!profile) return []
  const dow = day.getDay()
  const out: { kind: 'routine'; start: Date; end: Date; label: string; icon: string }[] = []
  if (profile.work_start && profile.work_end && profile.work_days?.includes(dow)) {
    out.push({
      kind: 'routine',
      start: atTime(day, profile.work_start),
      end: atTime(day, profile.work_end),
      label: 'Working hours',
      icon: '💼',
    })
  }
  if (profile.study_start && profile.study_end && profile.study_days?.includes(dow)) {
    out.push({
      kind: 'routine',
      start: atTime(day, profile.study_start),
      end: atTime(day, profile.study_end),
      label: 'Class / study time',
      icon: '📚',
    })
  }
  return out
}

type Row =
  | { kind: 'event'; start: Date; end: Date; ev: EventItem }
  | { kind: 'task'; start: Date; end: Date; block: PlannedBlock }
  | { kind: 'routine'; start: Date; end: Date; label: string; icon: string }

export function DayTimeline({ day, events, blocks, profile, onOpenTask, onOpenEvent }: Props) {
  const rows: Row[] = [
    ...routineRows(day, profile),
    ...events.map((ev) => ({ kind: 'event' as const, start: new Date(ev.start_at), end: new Date(ev.end_at), ev })),
    ...blocks.map((block) => ({ kind: 'task' as const, start: block.start, end: block.end, block })),
  ].sort((a, b) => a.start.getTime() - b.start.getTime())

  const now = new Date()
  const showNow = isSameDay(day, now)

  const hasEntries = rows.some((r) => r.kind !== 'routine')
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
              {r.kind === 'routine' ? (
                <div className="routine-band">
                  <span>
                    {r.icon} {r.label}
                  </span>
                  <span className="tiny dim">
                    {fmtTime(r.start)}–{fmtTime(r.end)}
                  </span>
                </div>
              ) : r.kind === 'event' ? (
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
      {!hasEntries && (
        <p className="tiny dim" style={{ padding: '10px 2px' }}>
          Only your routine so far — add tasks or tap “Plan my day”.
        </p>
      )}
    </div>
  )
}
