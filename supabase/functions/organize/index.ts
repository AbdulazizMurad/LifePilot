// =========================================================
// LifePilot — `organize` Edge Function
// Securely proxies OpenRouter. The API key lives ONLY here as a
// Supabase secret (OPENROUTER_API_KEY) and is never sent to the browser.
//
// The assistant is a task/schedule ORGANIZER only and refuses unrelated
// questions. Each user's own profile (role, working/study days+hours,
// sleep, energy peak) is loaded SERVER-SIDE from their JWT and turned
// into hard scheduling constraints, so the AI never proposes a time
// that collides with that user's real life.
// =========================================================
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = Deno.env.get('OPENROUTER_MODEL') ?? 'openai/gpt-4o-mini'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Surfaced in debug output so insert failures are never silent. */
let lastInsertError: string | null = null

const SYSTEM = `You are "LifePilot", a focused personal productivity and schedule ORGANIZER.

YOUR SCOPE — you ONLY help the user:
- decide what to do first and what can wait (prioritization),
- plan, schedule, and reschedule their tasks around their commitments and working/study hours,
- break big tasks into steps, estimate time, and stay realistic about their day.

STRICT RULE: If the user asks anything NOT about organizing their own tasks, schedule, time, or productivity — general knowledge, coding help, current events, math/trivia, translations, opinions, medical/legal/financial advice — politely decline in ONE sentence and redirect:
"I'm your task organizer, so I can only help you plan and prioritize your tasks — what would you like to get organized?"
Do not answer the off-topic question at all, and do NOT call any tool for it.

HOW YOU WORK — you are proactive; the user should never have to fill in forms:
1. When the user describes ANYTHING they need to do, immediately call create_tasks to save it. Infer sensible durations, priorities and categories yourself rather than interrogating them. Do not ask permission to save.
2. Right after saving, propose when to do them by calling propose_schedule.
3. Only if their message contains no tasks at all should you warmly ask what's on their plate.
Keep it conversational and low-friction.

SCHEDULING: Whenever you recommend specific times for the user's tasks — or the user agrees to a plan ("yes", "do it", "apply that", "schedule it") — you MUST call the propose_schedule tool with concrete blocks. Do NOT ask for confirmation first; propose your best plan by calling the tool (the app shows an "Apply" button so the user stays in control). Reference tasks by their EXACT id. Use the provided "Today" date unless the user names another day. Still give a short, warm text reply.

AVAILABILITY IS A HARD CONSTRAINT: You are given the user's exact FREE WINDOWS. Every block you propose MUST fit entirely inside one of them — check the start AND the end against the window before proposing it. Never overlap sleep, working hours, class hours or a fixed commitment, not even by a minute, and never suggest such a time in your text either. If a task is longer than the free window you had in mind, either split it across several windows/days or place it in a window that genuinely fits; say so honestly rather than overflowing.

STYLE: Warm, concise, practical. Use the user's context (role, hours, sleep, energy peak). Never invent tasks they didn't mention. Times are in the user's local timezone.`

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_tasks',
      description:
        "Save tasks the user just described in conversation. Call this as soon as they mention things they need to do, so you can then schedule them. Infer sensible duration/priority/category; ask only if something important is genuinely unclear.",
      parameters: {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Short actionable task name' },
                duration_minutes: { type: 'number', description: 'Best estimate in minutes (default 60)' },
                priority: { type: 'number', description: '1=low 2=normal 3=high 4=urgent' },
                category: {
                  type: 'string',
                  description: 'one of: general, work, study, personal, health, errand, appointment',
                },
                deadline: {
                  type: 'string',
                  description: "Local deadline as 'YYYY-MM-DDTHH:MM' if the user gave one, else omit",
                },
                notes: { type: 'string', description: 'Any extra detail the user mentioned' },
              },
              required: ['title'],
            },
          },
        },
        required: ['tasks'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_schedule',
      description:
        "Propose concrete time blocks to place the user's existing tasks onto their calendar. Call whenever you recommend specific times or the user agrees to a plan. Never overlap the user's UNAVAILABLE windows.",
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Warm 1-3 sentence summary of the plan for the user.' },
          blocks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                task_id: { type: 'string', description: 'EXACT id from the task list' },
                date: { type: 'string', description: 'Local date, YYYY-MM-DD' },
                start: { type: 'string', description: 'Local start time, 24h HH:MM' },
                end: { type: 'string', description: 'Local end time, 24h HH:MM' },
                reason: { type: 'string', description: 'Short why (e.g. "morning focus")' },
              },
              required: ['task_id', 'date', 'start', 'end'],
            },
          },
        },
        required: ['summary', 'blocks'],
      },
    },
  },
]

function fmtClock(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : '—'
}

function dayList(days: number[] | null | undefined): string {
  if (!days || !days.length) return 'no days'
  if (days.length === 7) return 'every day'
  return days
    .slice()
    .sort((a, b) => a - b)
    .map((d) => DAYS[d] ?? '?')
    .join(', ')
}

/**
 * Load the caller's own profile straight from the database using their JWT.
 * RLS guarantees this returns only their row, so the constraints we feed the
 * model are always that specific user's real settings.
 */
async function loadProfile(authHeader: string | null): Promise<Record<string, unknown> | null> {
  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !anon || !authHeader) return null
  try {
    const r = await fetch(`${url}/rest/v1/profiles?select=*&limit=1`, {
      headers: { apikey: anon, Authorization: authHeader, Accept: 'application/json' },
    })
    if (!r.ok) return null
    const rows = await r.json()
    return Array.isArray(rows) && rows.length ? rows[0] : null
  } catch {
    return null
  }
}

// deno-lint-ignore no-explicit-any
function buildContext(profile: any, tasks: any[], events: any[], today: string, nowLabel: string, nowMinutes: number | null = null): string {
  const lines: string[] = []
  const todayDow = SHORT_DAYS[new Date(`${today}T00:00:00`).getDay()] ?? ''
  lines.push(`Today is ${today} (${todayDow}). Current local time: ${nowLabel}.`)

  if (profile) {
    lines.push(
      `\nABOUT THIS USER: role=${profile.role}; timezone=${profile.timezone}; most focused in the ${profile.energy_peak}.`,
    )

    // Explicit, per-user hard constraints — including WHICH DAYS they apply.
    lines.push(`\nUNAVAILABLE (never schedule inside these):`)
    lines.push(`- Sleep: ${fmtClock(profile.sleep_start)}–${fmtClock(profile.sleep_end)}, every day.`)
    if (profile.work_start && profile.work_end && (profile.work_days ?? []).length) {
      lines.push(
        `- Work: ${fmtClock(profile.work_start)}–${fmtClock(profile.work_end)} on ${dayList(profile.work_days)}.`,
      )
    }
    if (profile.study_start && profile.study_end && (profile.study_days ?? []).length) {
      lines.push(
        `- Classes/study commitment: ${fmtClock(profile.study_start)}–${fmtClock(profile.study_end)} on ${dayList(profile.study_days)}. Study-type tasks MAY be placed here if nothing else fits; other tasks may not.`,
      )
    }
    lines.push(
      `Schedule only in the gaps outside those windows, and prefer the user's ${profile.energy_peak} peak for demanding tasks.`,
    )
  }

  const PR: Record<number, string> = { 1: 'low', 2: 'normal', 3: 'high', 4: 'urgent' }
  const active = (tasks ?? []).filter((t) => t.status !== 'done')
  if (active.length) {
    lines.push(`\nOpen tasks (reference by EXACT id):`)
    for (const t of active.slice(0, 40)) {
      const dl = t.deadline ? `, due ${new Date(t.deadline).toLocaleString()}` : ''
      lines.push(`- id:${t.id} | "${t.title}" [${PR[t.priority] ?? 'normal'}, ${t.duration_minutes}min${dl}] (${t.category})`)
    }
  } else {
    lines.push('\nNo open tasks.')
  }

  const upcoming = (events ?? []).slice(0, 20)
  if (upcoming.length) {
    lines.push(`\nFixed commitments (also UNAVAILABLE — never overlap):`)
    for (const e of upcoming) {
      lines.push(`- "${e.title}" ${new Date(e.start_at).toLocaleString()}–${new Date(e.end_at).toLocaleTimeString()}`)
    }
  }

  // Exact free windows, precomputed — the model must schedule only inside these.
  const windows = freeWindows(profile, events, today, nowMinutes)
  if (windows) {
    lines.push(
      `\nFREE WINDOWS (the ONLY times you may schedule; every block must fit entirely inside one of these):`,
    )
    lines.push(windows)
    lines.push(
      `If a task is longer than any single window, split it across several windows or days rather than overflowing.`,
    )
  }
  return lines.join('\n')
}

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function hhmmToMin(t: string | null | undefined): number | null {
  if (!t) return null
  const [h, m] = t.slice(0, 5).split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null
}
const minToHHMM = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/**
 * Precompute the user's genuinely free windows for the next few days so the
 * model never has to do interval arithmetic — it just picks from these.
 */
function freeWindows(
  // deno-lint-ignore no-explicit-any
  profile: any,
  // deno-lint-ignore no-explicit-any
  events: any[],
  todayISO: string,
  nowMinutes: number | null,
  days = 7,
): string {
  if (!profile) return ''
  const wake = hhmmToMin(profile.sleep_end) ?? 7 * 60
  let bed = hhmmToMin(profile.sleep_start) ?? 23 * 60
  if (bed <= wake) bed = 23 * 60 + 59

  const base = new Date(`${todayISO}T00:00:00`)
  const out: string[] = []

  for (let i = 0; i < days; i++) {
    const d = new Date(base)
    d.setDate(d.getDate() + i)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const dow = d.getDay()

    const busy: { s: number; e: number }[] = []
    const ws = hhmmToMin(profile.work_start)
    const we = hhmmToMin(profile.work_end)
    if (ws !== null && we !== null && (profile.work_days ?? []).includes(dow)) busy.push({ s: ws, e: we })
    const ss = hhmmToMin(profile.study_start)
    const se = hhmmToMin(profile.study_end)
    if (ss !== null && se !== null && (profile.study_days ?? []).includes(dow)) busy.push({ s: ss, e: se })

    for (const ev of events ?? []) {
      const evStart = new Date(ev.start_at)
      const evIso = `${evStart.getFullYear()}-${String(evStart.getMonth() + 1).padStart(2, '0')}-${String(evStart.getDate()).padStart(2, '0')}`
      if (evIso !== iso) continue
      const evEnd = new Date(ev.end_at)
      busy.push({ s: evStart.getHours() * 60 + evStart.getMinutes(), e: evEnd.getHours() * 60 + evEnd.getMinutes() })
    }

    let cursor = i === 0 && nowMinutes !== null ? Math.max(wake, nowMinutes) : wake
    const gaps: string[] = []
    for (const b of busy.sort((a, z) => a.s - z.s)) {
      if (b.e <= cursor) continue
      if (b.s > cursor) gaps.push(`${minToHHMM(cursor)}-${minToHHMM(Math.min(b.s, bed))}`)
      cursor = Math.max(cursor, b.e)
      if (cursor >= bed) break
    }
    if (cursor < bed) gaps.push(`${minToHHMM(cursor)}-${minToHHMM(bed)}`)

    out.push(`- ${iso} (${SHORT_DAYS[dow]}): ${gaps.length ? gaps.join(', ') : 'no free time'}`)
  }
  return out.join('\n')
}

const CATEGORIES = ['general', 'work', 'study', 'personal', 'health', 'errand', 'appointment']

/** Local 'YYYY-MM-DDTHH:MM' -> UTC ISO, using the caller's timezone offset. */
function localToUtcIso(local: string, tzOffsetMinutes: number): string | null {
  if (!local) return null
  const cleaned = local.trim().replace(' ', 'T')
  const withTime = cleaned.length <= 10 ? `${cleaned}T23:59` : cleaned.slice(0, 16)
  const ms = Date.parse(`${withTime}:00Z`)
  if (Number.isNaN(ms)) return null
  return new Date(ms + tzOffsetMinutes * 60_000).toISOString()
}

/**
 * Insert tasks the assistant extracted from conversation, as the calling user
 * (RLS scopes the write). Returns the created rows so we can schedule them.
 */
async function createTasks(
  authHeader: string | null,
  userId: string | null,
  // deno-lint-ignore no-explicit-any
  drafts: any[],
  tzOffsetMinutes: number,
  // deno-lint-ignore no-explicit-any
): Promise<any[]> {
  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !anon || !authHeader || !userId || !drafts?.length) return []

  const rows = drafts.slice(0, 15).map((d) => {
    const priority = Math.min(4, Math.max(1, Math.round(Number(d.priority) || 2)))
    const duration = Math.min(600, Math.max(5, Math.round(Number(d.duration_minutes) || 60)))
    const category = CATEGORIES.includes(String(d.category)) ? String(d.category) : 'general'
    return {
      user_id: userId,
      title: String(d.title ?? '').slice(0, 200),
      notes: d.notes ? String(d.notes).slice(0, 1000) : null,
      duration_minutes: duration,
      priority,
      category,
      deadline: d.deadline ? localToUtcIso(String(d.deadline), tzOffsetMinutes) : null,
      status: 'todo',
    }
  })
  .filter((r) => r.title.length > 0)

  if (!rows.length) return []
  try {
    const r = await fetch(`${url}/rest/v1/tasks`, {
      method: 'POST',
      headers: {
        apikey: anon,
        Authorization: authHeader,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(rows),
    })
    if (!r.ok) {
      lastInsertError = `${r.status}: ${(await r.text()).slice(0, 200)}`
      return []
    }
    const created = await r.json()
    return Array.isArray(created) ? created : []
  } catch (e) {
    lastInsertError = (e as Error).message
    return []
  }
}


// deno-lint-ignore no-explicit-any
async function chat(apiKey: string, messages: any[], tools?: any[], toolChoice?: unknown) {
  // deno-lint-ignore no-explicit-any
  const payload: any = { model: MODEL, messages, temperature: 0.3, max_tokens: 800 }
  if (tools) {
    payload.tools = tools
    payload.tool_choice = toolChoice ?? 'auto'
  }
  const resp = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://lifepilot.app',
      'X-Title': 'LifePilot',
    },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`OpenRouter ${resp.status}: ${text.slice(0, 200)}`)
  }
  const data = await resp.json()
  return data?.choices?.[0]?.message ?? {}
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  lastInsertError = null

  const apiKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!apiKey) return json({ ok: false, reply: '', error: 'OPENROUTER_API_KEY not configured on the server.' })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, reply: '', error: 'Invalid request body.' }, 400)
  }

  const mode = body.mode === 'plan' ? 'plan' : 'chat'
  // Authoritative per-user profile from the DB; fall back to the client copy.
  const serverProfile = await loadProfile(req.headers.get('Authorization'))
  const profile = serverProfile ?? body.profile
  // deno-lint-ignore no-explicit-any
  const tasks = (body.tasks as any[]) ?? []
  // deno-lint-ignore no-explicit-any
  const events = (body.events as any[]) ?? []
  const today = String(body.clientToday ?? new Date().toISOString().slice(0, 10))
  const nowLabel = String(body.clientNow ?? new Date().toLocaleTimeString())
  // Minutes to add to a local wall-clock time to get UTC (Date#getTimezoneOffset).
  const tzOffset = Number.isFinite(Number(body.clientTzOffset)) ? Number(body.clientTzOffset) : 0
  const nowMinutes = Number.isFinite(Number(body.clientNowMinutes)) ? Number(body.clientNowMinutes) : null
  const context = buildContext(profile, tasks, events, today, nowLabel, nowMinutes)

  try {
    if (mode === 'plan') {
      // deno-lint-ignore no-explicit-any
      const blocks = (body.precomputed as any[]) ?? []
      const planText = blocks.length
        ? blocks
            .map(
              (b) =>
                `${new Date(b.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}–${new Date(
                  b.end,
                ).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}: ${b.title}`,
            )
            .join('\n')
        : '(no tasks could be scheduled)'
      const msg = await chat(apiKey, [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `Here is my context:\n${context}\n\nA schedule has already been laid out for my day:\n${planText}\n\nIn 2-3 warm sentences, summarize this plan and give me ONE practical tip. Do not list the schedule back verbatim, and do not call any tool.`,
        },
      ])
      return json({ ok: true, reply: (msg.content ?? '').trim() })
    }

    // deno-lint-ignore no-explicit-any
    const history = ((body.history as any[]) ?? []).slice(-6).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content ?? ''),
    }))
    const message = String(body.message ?? '')

    const hasTasks = (tasks ?? []).some((t) => t.status !== 'done')
    const scheduleIntent =
      /\b(schedul|organi[sz]e|plan|calendar|reschedul|book|slot|time.?block|fit|when should i|put .* (on|in) my|add .* to my)\b/i.test(
        message,
      )
    const affirmative = /^\s*(yes|yep|yeah|sure|ok|okay|go ahead|do it|apply|please do|sounds good|perfect|great)\b/i.test(
      message,
    )
    const lastAssistant = [...history].reverse().find((m) => m.role === 'assistant')?.content ?? ''
    const assistantOfferedPlan = /schedul|plan|shall i|go ahead|time/i.test(lastAssistant)
    const force = hasTasks && (scheduleIntent || (affirmative && assistantOfferedPlan))
    const toolChoice = force ? { type: 'function', function: { name: 'propose_schedule' } } : 'auto'

    const noTaskGuidance = hasTasks
      ? null
      : {
          role: 'system',
          content:
            "The user has no tasks saved yet. If their message describes anything they need to do, call create_tasks RIGHT NOW to save those tasks (infer duration/priority/category yourself) and then schedule them — do not ask permission first. Only if their message contains no tasks at all (a greeting or a vague question) should you warmly ask what's on their plate. Never invent tasks they didn't mention.",
        }

    const baseMessages = [
      { role: 'system', content: SYSTEM },
      { role: 'system', content: `Current user context:\n${context}` },
      ...(noTaskGuidance ? [noTaskGuidance] : []),
      ...history,
      { role: 'user', content: message },
    ]

    const msg = await chat(apiKey, baseMessages, TOOLS, toolChoice)

    let reply = (msg.content ?? '').trim()
    // deno-lint-ignore no-explicit-any
    let result: any
    // deno-lint-ignore no-explicit-any
    let created: any[] = []
    // deno-lint-ignore no-explicit-any
    const calls = (msg.tool_calls as any[]) ?? []
    const parseArgs = (c: unknown) => {
      try {
        // deno-lint-ignore no-explicit-any
        return JSON.parse((c as any)?.function?.arguments || '{}')
      } catch {
        return {}
      }
    }

    // 1) Save any tasks the assistant extracted from the conversation.
    const createCall = calls.find((c) => c?.function?.name === 'create_tasks')
    if (createCall) {
      const args = parseArgs(createCall)
      if (Array.isArray(args.tasks) && args.tasks.length) {
        created = await createTasks(
          req.headers.get('Authorization'),
          // deno-lint-ignore no-explicit-any
          (profile as any)?.id ?? null,
          args.tasks,
          tzOffset,
        )
      }
    }

    // 2) A schedule proposed in the same turn. Ignore it when tasks were just
    //    created — the model was guessing ids that did not exist yet, so we
    //    re-ask below with the real ones.
    const planCall = createCall ? undefined : calls.find((c) => c?.function?.name === 'propose_schedule')
    if (planCall) {
      const args = parseArgs(planCall)
      if (Array.isArray(args.blocks) && args.blocks.length) {
        result = { summary: String(args.summary ?? ''), blocks: args.blocks }
      }
    }

    // 3) If we just created tasks but have no plan yet, immediately ask for one
    //    so the user goes from "here's my week" to a real schedule in one step.
    if (created.length && !result) {
      const allTasks = [...(tasks ?? []), ...created]
      const followUp = await chat(
        apiKey,
        [
          { role: 'system', content: SYSTEM },
          {
            role: 'system',
            content: `Current user context:\n${buildContext(profile, allTasks, events, today, nowLabel, nowMinutes)}`,
          },
          {
            role: 'user',
            content:
              'I just saved those tasks. Schedule them into my free time now, respecting every UNAVAILABLE window, and give me a short warm summary.',
          },
        ],
        TOOLS,
        { type: 'function', function: { name: 'propose_schedule' } },
      )
      // deno-lint-ignore no-explicit-any
      const fCall = ((followUp.tool_calls as any[]) ?? []).find(
        (c) => c?.function?.name === 'propose_schedule',
      )
      if (fCall) {
        const args = parseArgs(fCall)
        if (Array.isArray(args.blocks) && args.blocks.length) {
          result = { summary: String(args.summary ?? ''), blocks: args.blocks }
        }
      }
      const followText = (followUp.content ?? '').trim()
      if (followText) reply = reply ? `${reply}\n\n${followText}` : followText
    }

    if (!reply) reply = result?.summary || (created.length ? 'Saved those for you.' : 'Okay!')

    return json({
      ok: true,
      reply,
      result,
      created,
      debug: body.debug
        ? { toolCalls: calls.map((c) => c?.function?.name), insertError: lastInsertError }
        : undefined,
    })
  } catch (e) {
    return json({ ok: false, reply: '', error: (e as Error).message })
  }
})
