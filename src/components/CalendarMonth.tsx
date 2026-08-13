import { useMemo } from 'react'
import type { Task, EventItem, Profile } from '@/lib/types'
import {
  monthMatrix,
  isSameDay,
  isSameMonth,
  isToday,
  addMonths,
  format,
  parseISO,
} from '@/lib/date'
import { PRIORITY_META, WEEKDAYS } from '@/lib/ui'
import { IconChevronL, IconChevronR } from './ui/icons'

interface Props {
  anchor: Date
  selected: Date
  tasks: Task[]
  events: EventItem[]
  profile?: Profile | null
  onSelect: (d: Date) => void
  onAnchorChange: (d: Date) => void
}

interface DayInfo {
  taskColors: string[]
  hasEvent: boolean
  count: number
}

export function CalendarMonth({ anchor, selected, tasks, events, profile, onSelect, onAnchorChange }: Props) {
  const cells = useMemo(() => monthMatrix(anchor), [anchor])

  const byDay = useMemo(() => {
    const map = new Map<string, DayInfo>()
    const key = (d: Date) => format(d, 'yyyy-MM-dd')
    for (const t of tasks) {
      const ref = t.scheduled_start ?? t.deadline
      if (!ref) continue
      const k = key(parseISO(ref))
      const info = map.get(k) ?? { taskColors: [], hasEvent: false, count: 0 }
      if (info.taskColors.length < 3) info.taskColors.push(PRIORITY_META[t.priority].color)
      info.count++
      map.set(k, info)
    }
    for (const e of events) {
      const k = key(parseISO(e.start_at))
      const info = map.get(k) ?? { taskColors: [], hasEvent: false, count: 0 }
      info.hasEvent = true
      info.count++
      map.set(k, info)
    }
    return map
  }, [tasks, events])

  return (
    <div className="cal">
      <div className="cal-head">
        <h2>{format(anchor, 'MMMM yyyy')}</h2>
        <div className="cal-nav">
          <button className="btn btn--icon btn--ghost" onClick={() => onAnchorChange(addMonths(anchor, -1))} aria-label="Previous month">
            <IconChevronL width={18} height={18} />
          </button>
          <button className="btn btn--sm btn--soft" onClick={() => onAnchorChange(new Date())}>
            Today
          </button>
          <button className="btn btn--icon btn--ghost" onClick={() => onAnchorChange(addMonths(anchor, 1))} aria-label="Next month">
            <IconChevronR width={18} height={18} />
          </button>
        </div>
      </div>

      <div className="cal-weekdays">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d[0]}</span>
        ))}
      </div>

      <div className="cal-grid">
        {cells.map((d) => {
          const info = byDay.get(format(d, 'yyyy-MM-dd'))
          const out = !isSameMonth(d, anchor)
          const isWorkday =
            !!profile?.work_start && (profile.work_days?.includes(d.getDay()) ?? false)
          const cls = [
            'cal-cell',
            out ? 'out' : '',
            isWorkday ? 'workday' : '',
            isToday(d) ? 'today' : '',
            isSameDay(d, selected) ? 'selected' : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <button key={d.toISOString()} className={cls} onClick={() => onSelect(d)}>
              {info && info.count > 1 && <span className="count">{info.count}</span>}
              <span className="num">{format(d, 'd')}</span>
              <span className="cal-dots">
                {info?.taskColors.map((c, i) => (
                  <span key={i} className="dot" style={{ background: c }} />
                ))}
                {info?.hasEvent && <span className="dot" style={{ background: 'var(--accent)' }} />}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
