// =========================================================
// LifePilot local scheduling engine
// Deterministic prioritization + slotting of flexible tasks
// around fixed commitments, working/study hours and sleep.
// Used directly in the UI and as the fallback when AI is off.
// =========================================================
import type { Profile, Task, EventItem, Priority } from './types'
import { atTime, parseISO, isSameDay, timeToMinutes } from './date'

export interface Interval {
  start: Date
  end: Date
}

export interface PlannedBlock {
  task: Task
  start: Date
  end: Date
  reason: string
}

const PRIORITY_WEIGHT: Record<Priority, number> = { 1: 1, 2: 2.2, 3: 3.6, 4: 5.5 }

/**
 * Urgency score for ordering a backlog. Higher = do sooner.
 * Combines priority with deadline pressure and a small age nudge.
 */
export function urgencyScore(task: Task, now = new Date()): number {
  let score = PRIORITY_WEIGHT[task.priority] ?? 2
  if (task.deadline) {
    const hoursLeft = (parseISO(task.deadline).getTime() - now.getTime()) / 3_600_000
    if (hoursLeft <= 0) score += 100 // overdue floats to the very top
    else if (hoursLeft < 24) score += 40 - hoursLeft // within a day
    else if (hoursLeft < 72) score += 12 - hoursLeft / 12
    else score += 2
    // A task you can't finish before its deadline gets a nudge up too.
    const hoursNeeded = task.duration_minutes / 60
    if (hoursLeft > 0 && hoursNeeded > hoursLeft * 0.5) score += 4
  }
  return score
}

export function sortByUrgency(tasks: Task[], now = new Date()): Task[] {
  return [...tasks].sort((a, b) => urgencyScore(b, now) - urgencyScore(a, now))
}

/** Subtract a set of busy intervals from a window, returning free gaps. */
function subtract(window: Interval, busy: Interval[]): Interval[] {
  const sorted = busy
    .filter((b) => b.end > window.start && b.start < window.end)
    .sort((a, b) => a.start.getTime() - b.start.getTime())
  const free: Interval[] = []
  let cursor = window.start
  for (const b of sorted) {
    const bStart = b.start < window.start ? window.start : b.start
    const bEnd = b.end > window.end ? window.end : b.end
    if (bStart > cursor) free.push({ start: cursor, end: bStart })
    if (bEnd > cursor) cursor = bEnd
  }
  if (cursor < window.end) free.push({ start: cursor, end: window.end })
  return free
}

/**
 * Compute the free intervals of a given day for scheduling flexible tasks.
 * Busy = sleep + fixed events + (working hours if not the free-time we want).
 * We treat work/study hours as busy so personal tasks land in genuine gaps.
 */
export function freeIntervalsForDay(
  day: Date,
  profile: Profile | null,
  events: EventItem[],
  opts: { treatWorkAsBusy?: boolean; treatStudyAsBusy?: boolean; now?: Date } = {},
): Interval[] {
  const { treatWorkAsBusy = true, treatStudyAsBusy = true, now = new Date() } = opts

  // Awake window for the day (from sleep_end today to sleep_start tonight)
  const sleepEnd = profile?.sleep_end ?? '07:00'
  const sleepStart = profile?.sleep_start ?? '23:00'
  const dayStart = atTime(day, sleepEnd)
  let dayEnd = atTime(day, sleepStart)
  if (dayEnd <= dayStart) dayEnd = atTime(day, '23:59') // guard weird configs

  const busy: Interval[] = []
  const weekday = day.getDay()

  if (profile && treatWorkAsBusy && profile.work_start && profile.work_end && profile.work_days.includes(weekday)) {
    busy.push({ start: atTime(day, profile.work_start), end: atTime(day, profile.work_end) })
  }
  if (profile && treatStudyAsBusy && profile.study_start && profile.study_end && profile.study_days.includes(weekday)) {
    busy.push({ start: atTime(day, profile.study_start), end: atTime(day, profile.study_end) })
  }
  for (const ev of events) {
    const s = parseISO(ev.start_at)
    const e = parseISO(ev.end_at)
    if (isSameDay(s, day) || isSameDay(e, day) || (s < dayStart && e > dayEnd)) {
      busy.push({ start: s, end: e })
    }
  }

  let free = subtract({ start: dayStart, end: dayEnd }, busy)
  // Don't schedule into the past for today.
  if (isSameDay(day, now)) {
    free = free
      .map((f) => ({ start: f.start < now ? now : f.start, end: f.end }))
      .filter((f) => f.end.getTime() - f.start.getTime() >= 5 * 60_000)
  }
  return free
}

/**
 * Greedily place tasks (highest urgency first) into free intervals,
 * respecting each task's estimated duration and deadline.
 */
export function planDay(
  day: Date,
  tasks: Task[],
  profile: Profile | null,
  events: EventItem[],
  now = new Date(),
): { blocks: PlannedBlock[]; unplaced: Task[] } {
  // Working hours are treated as busy (job time). Study hours are NOT blocked —
  // they're the natural time for study tasks, so we let tasks flow into them.
  const free = freeIntervalsForDay(day, profile, events, { now, treatStudyAsBusy: false })
  // Mutable copy of free gaps we consume as we place tasks.
  const gaps = free.map((f) => ({ start: new Date(f.start), end: new Date(f.end) }))
  const ordered = sortByUrgency(
    tasks.filter((t) => t.status !== 'done'),
    now,
  )

  const blocks: PlannedBlock[] = []
  const unplaced: Task[] = []

  for (const task of ordered) {
    const needMs = task.duration_minutes * 60_000
    const deadline = task.deadline ? parseISO(task.deadline) : null
    let placed = false

    for (const gap of gaps) {
      const avail = gap.end.getTime() - gap.start.getTime()
      if (avail < needMs) continue
      const blockStart = new Date(gap.start)
      const blockEnd = new Date(gap.start.getTime() + needMs)
      // Respect the deadline if there is one.
      if (deadline && blockEnd > deadline) continue
      blocks.push({
        task,
        start: blockStart,
        end: blockEnd,
        reason: buildReason(task, deadline, now),
      })
      gap.start = new Date(blockEnd.getTime() + 5 * 60_000) // 5-min breather
      placed = true
      break
    }
    if (!placed) unplaced.push(task)
  }

  blocks.sort((a, b) => a.start.getTime() - b.start.getTime())
  return { blocks, unplaced }
}

function buildReason(task: Task, deadline: Date | null, now: Date): string {
  if (deadline) {
    const h = (deadline.getTime() - now.getTime()) / 3_600_000
    if (h <= 0) return 'Overdue — tackle first.'
    if (h < 24) return 'Due within a day.'
    if (h < 72) return 'Deadline is close.'
  }
  if (task.priority >= 4) return 'Marked urgent.'
  if (task.priority === 3) return 'High priority.'
  return 'Fits your free time today.'
}

/**
 * Hard check: does [start,end) collide with anything this user genuinely
 * cannot move — sleep, their working hours, or a fixed commitment?
 * Used to validate AI-proposed blocks so a bad suggestion can never be
 * written onto the calendar, regardless of what the model returns.
 */
export function availabilityConflict(
  start: Date,
  end: Date,
  profile: Profile | null,
  events: EventItem[],
  opts: { category?: string } = {},
): string | null {
  if (end <= start) return 'invalid time range'

  // Fixed commitments.
  for (const ev of events) {
    const s = parseISO(ev.start_at)
    const e = parseISO(ev.end_at)
    if (start < e && end > s) return `overlaps "${ev.title}"`
  }
  if (!profile) return null

  // Sleep: anything outside the awake window is out of bounds. The awake
  // window may wrap midnight, so compare in minutes-of-day.
  const wake = timeToMinutes(profile.sleep_end) ?? 0
  const bed = timeToMinutes(profile.sleep_start) ?? 24 * 60
  const startMin = start.getHours() * 60 + start.getMinutes()
  const endMin = startMin + Math.round((end.getTime() - start.getTime()) / 60000)
  const awakeEnd = bed > wake ? bed : bed + 24 * 60 // normalise wrap
  if (startMin < wake || endMin > awakeEnd) return 'falls inside your sleep hours'

  // Working hours on working days (a job you cannot skip).
  const day = start.getDay()
  if (profile.work_start && profile.work_end && profile.work_days.includes(day)) {
    const ws = atTime(start, profile.work_start)
    const we = atTime(start, profile.work_end)
    if (start < we && end > ws) return 'overlaps your working hours'
  }

  // Class/study commitment blocks non-study work only.
  if (
    profile.study_start &&
    profile.study_end &&
    profile.study_days.includes(day) &&
    opts.category !== 'study'
  ) {
    const ss = atTime(start, profile.study_start)
    const se = atTime(start, profile.study_end)
    if (start < se && end > ss) return 'overlaps your class/study hours'
  }
  return null
}

/** What should I do *right now*? First scheduled/urgent actionable task. */
export function pickNow(tasks: Task[], now = new Date()): Task | null {
  const active = tasks.filter((t) => t.status !== 'done')
  if (active.length === 0) return null
  // Prefer an in-progress task, then the one scheduled for now, then urgency.
  const inProgress = active.find((t) => t.status === 'in_progress')
  if (inProgress) return inProgress
  const scheduledNow = active.find(
    (t) =>
      t.scheduled_start &&
      t.scheduled_end &&
      parseISO(t.scheduled_start) <= now &&
      parseISO(t.scheduled_end) >= now,
  )
  if (scheduledNow) return scheduledNow
  return sortByUrgency(active, now)[0] ?? null
}
