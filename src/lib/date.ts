// =========================================================
// Date & time helpers (thin wrappers over date-fns)
// =========================================================
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  isToday,
  addMonths,
  addMinutes,
  differenceInMinutes,
  isBefore,
  isAfter,
  parseISO,
  startOfDay,
  endOfDay,
} from 'date-fns'

export {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  isToday,
  addMonths,
  addMinutes,
  differenceInMinutes,
  isBefore,
  isAfter,
  parseISO,
  startOfDay,
  endOfDay,
}

/** Build the 6-week grid (42 cells) for a month view. */
export function monthMatrix(anchor: Date): Date[] {
  const start = startOfWeek(startOfMonth(anchor), { weekStartsOn: 0 })
  const end = endOfWeek(endOfMonth(anchor), { weekStartsOn: 0 })
  return eachDayOfInterval({ start, end })
}

/** 'HH:MM' string -> minutes since midnight. */
export function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

/** minutes since midnight -> 'HH:MM'. */
export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Apply an 'HH:MM' clock time onto a given day, returning a Date. */
export function atTime(day: Date, clock: string): Date {
  const [h, m] = clock.split(':').map(Number)
  const d = new Date(day)
  d.setHours(h || 0, m || 0, 0, 0)
  return d
}

export function fmtTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? parseISO(iso) : iso
  return format(d, 'h:mm a')
}

export function fmtDayLabel(d: Date): string {
  if (isToday(d)) return 'Today'
  return format(d, 'EEE, MMM d')
}

/** Human relative deadline, e.g. "in 3h", "2d left", "overdue". */
export function deadlineLabel(iso: string, now = new Date()): { text: string; tone: 'ok' | 'soon' | 'overdue' } {
  const d = parseISO(iso)
  const mins = differenceInMinutes(d, now)
  if (mins < 0) return { text: 'Overdue', tone: 'overdue' }
  if (mins < 60) return { text: `in ${mins}m`, tone: 'soon' }
  const hours = Math.round(mins / 60)
  if (hours < 24) return { text: `in ${hours}h`, tone: hours <= 6 ? 'soon' : 'ok' }
  const days = Math.round(hours / 24)
  return { text: `${days}d left`, tone: 'ok' }
}

export function durationLabel(mins: number): string {
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

/** Local IANA timezone guess for onboarding defaults. */
export function guessTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}
