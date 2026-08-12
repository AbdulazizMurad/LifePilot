// =========================================================
// Client for the LifePilot AI organizer.
// Calls the Supabase Edge Function `organize`, which holds the
// OpenRouter key server-side. The frontend never sees the key.
//
// Design: precise time math (free slots, placement) runs locally in
// the scheduler (correct in the user's timezone). The AI handles
// prioritization advice and natural-language narration — and is
// constrained server-side to task-organizing topics only.
// =========================================================
import { supabase } from './supabase'
import type { Profile, Task, EventItem, OrganizerResult, ScheduleBlock } from './types'
import { planDay, availabilityConflict } from './scheduler'
import { isSameDay, parseISO } from './date'

export interface OrganizeRequest {
  mode: 'chat' | 'plan'
  message?: string
  day?: string
  profile: Profile | null
  // Compact context the model needs — we never send more than necessary.
  tasks: Task[]
  events: EventItem[]
  history?: { role: 'user' | 'assistant'; content: string }[]
  // For plan mode: locally-computed blocks the AI should narrate.
  precomputed?: ScheduleBlock[]
}

export interface OrganizeResponse {
  ok: boolean
  reply: string
  result?: OrganizerResult
  refused?: boolean
  error?: string
}

// Raw block shape the AI emits (local wall-clock, converted client-side).
interface RawBlock {
  task_id: string
  date?: string // YYYY-MM-DD
  start: string // 'HH:MM' or ISO
  end: string // 'HH:MM' or ISO
  reason?: string
  title?: string
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

/**
 * Convert AI blocks (local date + 'HH:MM') into ISO ScheduleBlocks, resolved in
 * the browser's own timezone (so times land exactly where the user expects).
 * Blocks referencing unknown task ids are dropped.
 */
function normalizeBlocks(
  raw: RawBlock[],
  tasks: Task[],
  profile: Profile | null,
  events: EventItem[],
): { blocks: ScheduleBlock[]; rejected: string[] } {
  const out: ScheduleBlock[] = []
  const rejected: string[] = []
  for (const b of raw) {
    const task = tasks.find((t) => t.id === b.task_id)
    if (!task) continue
    const toISO = (v: string, date?: string): string | null => {
      if (!v) return null
      // already ISO?
      if (v.includes('T')) {
        const d = new Date(v)
        return isNaN(d.getTime()) ? null : d.toISOString()
      }
      if (!date) return null
      const d = new Date(`${date}T${v.length === 5 ? v : v.slice(0, 5)}:00`)
      return isNaN(d.getTime()) ? null : d.toISOString()
    }
    const start = toISO(b.start, b.date)
    const end = toISO(b.end, b.date)
    if (!start || !end) continue

    // Hard gate: never let a block through that collides with this user's
    // sleep, working hours, or fixed commitments — whatever the model said.
    const conflict = availabilityConflict(new Date(start), new Date(end), profile, events, {
      category: task.category,
    })
    if (conflict) {
      rejected.push(`${task.title} — ${conflict}`)
      continue
    }
    out.push({ task_id: task.id, title: task.title, start, end, reason: b.reason ?? '' })
  }
  return { blocks: out, rejected }
}

export async function organize(req: OrganizeRequest): Promise<OrganizeResponse> {
  try {
    const now = new Date()
    const clientToday = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    const clientNow = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    const { data, error } = await supabase.functions.invoke<OrganizeResponse>('organize', {
      body: { ...req, clientToday, clientNow },
    })
    if (error) return { ok: false, reply: '', error: humanError(error.message) }
    if (!data) return { ok: false, reply: '', error: 'Empty response from organizer.' }
    // Normalize any AI-proposed plan into applyable ISO blocks, dropping any
    // that would collide with the user's real availability.
    if (data.result?.blocks?.length) {
      const { blocks, rejected } = normalizeBlocks(
        data.result.blocks as unknown as RawBlock[],
        req.tasks,
        req.profile,
        req.events,
      )
      data.result = { ...data.result, blocks, rejected }
    }
    return data
  } catch (e) {
    return { ok: false, reply: '', error: humanError((e as Error).message) }
  }
}

/**
 * Plan a day: compute the schedule locally (accurate), then ask the AI to
 * narrate it and add one practical tip. Falls back gracefully if AI is off.
 */
export async function planDayWithAI(
  day: Date,
  profile: Profile | null,
  tasks: Task[],
  events: EventItem[],
): Promise<OrganizeResponse> {
  const dayEvents = events.filter((e) => isSameDay(parseISO(e.start_at), day))
  const candidates = tasks.filter((t) => t.status !== 'done' && !t.scheduled_start)
  const { blocks, unplaced } = planDay(day, candidates, profile, dayEvents)

  const precomputed: ScheduleBlock[] = blocks.map((b) => ({
    task_id: b.task.id,
    title: b.task.title,
    start: b.start.toISOString(),
    end: b.end.toISOString(),
    reason: b.reason,
  }))

  const localResult: OrganizerResult = {
    summary:
      precomputed.length === 0
        ? 'You have no unscheduled tasks to plan right now.'
        : `I fit ${precomputed.length} task${precomputed.length > 1 ? 's' : ''} into your free time today.`,
    blocks: precomputed,
    advice: unplaced.length ? `${unplaced.length} task(s) didn't fit — consider a deadline or shorter session.` : undefined,
  }

  // Ask the AI to narrate; if it fails we still return the deterministic plan.
  const res = await organize({ mode: 'plan', day: day.toISOString(), profile, tasks, events, precomputed })
  if (res.ok) {
    return {
      ok: true,
      reply: res.reply || localResult.summary,
      result: { ...localResult, summary: res.reply || localResult.summary },
    }
  }
  // Fallback: deterministic plan without AI narration.
  return { ok: true, reply: localResult.summary, result: localResult }
}

function humanError(msg: string): string {
  if (/not.*configured|OPENROUTER/i.test(msg)) return 'The AI is not fully set up yet (missing key).'
  if (/Failed to fetch|network/i.test(msg)) return 'Could not reach the organizer. Check your connection.'
  return msg
}
