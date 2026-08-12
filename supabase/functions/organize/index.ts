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

const SYSTEM = `You are "LifePilot", a focused personal productivity and schedule ORGANIZER.

YOUR SCOPE — you ONLY help the user:
- decide what to do first and what can wait (prioritization),
- plan, schedule, and reschedule their tasks around their commitments and working/study hours,
- break big tasks into steps, estimate time, and stay realistic about their day.

STRICT RULE: If the user asks anything NOT about organizing their own tasks, schedule, time, or productivity — general knowledge, coding help, current events, math/trivia, translations, opinions, medical/legal/financial advice — politely decline in ONE sentence and redirect:
"I'm your task organizer, so I can only help you plan and prioritize your tasks — what would you like to get organized?"
Do not answer the off-topic question at all, and do NOT call any tool for it.

SCHEDULING: Whenever you recommend specific times for the user's tasks — or the user agrees to a plan ("yes", "do it", "apply that", "schedule it") — you MUST call the propose_schedule tool with concrete blocks. Do NOT ask for confirmation first; propose your best plan by calling the tool (the app shows an "Apply" button so the user stays in control). Reference tasks by their EXACT id. Use the provided "Today" date unless the user names another day. Still give a short, warm text reply.

AVAILABILITY IS A HARD CONSTRAINT: The "UNAVAILABLE" windows below are times the user genuinely cannot work. NEVER place a block that overlaps them, not even partially, and never suggest such a time in your text either. Only use the user's genuinely free time. If a task cannot fit without a collision, say so honestly and suggest the nearest free window or a shorter session instead of overlapping. Respect each window's specific days of the week.

STYLE: Warm, concise, practical. Use the user's context (role, hours, sleep, energy peak). Never invent tasks they didn't mention. Times are in the user's local timezone.`

const TOOLS = [
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
function buildContext(profile: any, tasks: any[], events: any[], today: string, nowLabel: string): string {
  const lines: string[] = []
  lines.push(`Today is ${today}. Current local time: ${nowLabel}.`)

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
  return lines.join('\n')
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
  const context = buildContext(profile, tasks, events, today, nowLabel)

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
            "The user currently has NO tasks saved. Do NOT invent tasks and do NOT propose a schedule. In one or two friendly sentences, tell them to add their tasks first using the + button (title, how long it takes, priority, and any deadline), and say you'll organize them right after. Do not call any tool.",
        }

    const msg = await chat(
      apiKey,
      [
        { role: 'system', content: SYSTEM },
        { role: 'system', content: `Current user context:\n${context}` },
        ...(noTaskGuidance ? [noTaskGuidance] : []),
        ...history,
        { role: 'user', content: message },
      ],
      TOOLS,
      toolChoice,
    )

    let reply = (msg.content ?? '').trim()
    // deno-lint-ignore no-explicit-any
    let result: any
    // deno-lint-ignore no-explicit-any
    const call = ((msg.tool_calls as any[]) ?? []).find((c) => c?.function?.name === 'propose_schedule')
    if (call) {
      try {
        const args = JSON.parse(call.function.arguments || '{}')
        if (Array.isArray(args.blocks) && args.blocks.length) {
          result = { summary: String(args.summary ?? ''), blocks: args.blocks }
          if (!reply) reply = String(args.summary ?? 'Here is a plan you can apply to your calendar.')
        }
      } catch {
        /* ignore malformed tool args */
      }
    }
    if (!reply) reply = 'Okay!'

    return json({ ok: true, reply, result })
  } catch (e) {
    return json({ ok: false, reply: '', error: (e as Error).message })
  }
})
