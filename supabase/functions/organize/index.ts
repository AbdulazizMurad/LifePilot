// =========================================================
// LifePilot — `organize` Edge Function
// Securely proxies OpenRouter. The API key lives ONLY here as a
// Supabase secret (OPENROUTER_API_KEY) and is never sent to the browser.
//
// The assistant is constrained to be a task/schedule ORGANIZER only.
// It refuses unrelated questions.
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
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

// ---------- prompt building ----------
const SYSTEM = `You are "LifePilot", a focused personal productivity and schedule ORGANIZER.

YOUR SCOPE — you ONLY help the user:
- decide what to do first and what can wait (prioritization),
- plan, schedule, and reschedule their tasks around their commitments and working/study hours,
- break big tasks into steps, estimate time, and stay realistic about their day.

STRICT RULE: If the user asks anything NOT about organizing their own tasks, schedule, time, or productivity — for example general knowledge, coding help, current events, math/trivia, translations, opinions, or medical/legal/financial advice — you MUST politely decline in ONE sentence and redirect, e.g.:
"I'm your task organizer, so I can only help you plan and prioritize your tasks — what would you like to get organized?"
Do not answer the off-topic question at all.

STYLE: Warm, concise, practical. Speak directly to the user. Prefer short paragraphs or tight bullet lists. Use their context (role, working/study hours, sleep, energy peak) to be realistic. Never invent tasks they didn't mention. Times are already in the user's local timezone.`

function fmtClock(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : '—'
}

// deno-lint-ignore no-explicit-any
function buildContext(profile: any, tasks: any[], events: any[]): string {
  const lines: string[] = []
  if (profile) {
    lines.push(
      `User role: ${profile.role}. Timezone: ${profile.timezone}. Most focused: ${profile.energy_peak}.`,
    )
    if (profile.work_start)
      lines.push(`Working hours: ${fmtClock(profile.work_start)}–${fmtClock(profile.work_end)}.`)
    if (profile.study_start)
      lines.push(`Study hours: ${fmtClock(profile.study_start)}–${fmtClock(profile.study_end)}.`)
    lines.push(`Sleeps ${fmtClock(profile.sleep_start)}–${fmtClock(profile.sleep_end)}.`)
  }
  const PR: Record<number, string> = { 1: 'low', 2: 'normal', 3: 'high', 4: 'urgent' }
  const active = (tasks ?? []).filter((t) => t.status !== 'done')
  if (active.length) {
    lines.push(`\nOpen tasks (${active.length}):`)
    for (const t of active.slice(0, 40)) {
      const dl = t.deadline ? `, due ${new Date(t.deadline).toLocaleString()}` : ''
      const est = `${t.duration_minutes}min`
      lines.push(`- "${t.title}" [${PR[t.priority] ?? 'normal'}, ${est}${dl}] (${t.category})`)
    }
  } else {
    lines.push('\nNo open tasks.')
  }
  const upcoming = (events ?? []).slice(0, 20)
  if (upcoming.length) {
    lines.push(`\nFixed commitments:`)
    for (const e of upcoming) {
      lines.push(
        `- "${e.title}" ${new Date(e.start_at).toLocaleString()}–${new Date(e.end_at).toLocaleTimeString()}`,
      )
    }
  }
  return lines.join('\n')
}

// deno-lint-ignore no-explicit-any
async function callOpenRouter(apiKey: string, messages: any[]): Promise<string> {
  const resp = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://lifepilot.app',
      'X-Title': 'LifePilot',
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.4,
      max_tokens: 500,
    }),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`OpenRouter ${resp.status}: ${text.slice(0, 200)}`)
  }
  const data = await resp.json()
  return data?.choices?.[0]?.message?.content?.trim() ?? ''
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const apiKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!apiKey) {
    return json({ ok: false, reply: '', error: 'OPENROUTER_API_KEY not configured on the server.' })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, reply: '', error: 'Invalid request body.' }, 400)
  }

  const mode = body.mode === 'plan' ? 'plan' : 'chat'
  // deno-lint-ignore no-explicit-any
  const profile = body.profile as any
  // deno-lint-ignore no-explicit-any
  const tasks = (body.tasks as any[]) ?? []
  // deno-lint-ignore no-explicit-any
  const events = (body.events as any[]) ?? []
  const context = buildContext(profile, tasks, events)

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
      const messages = [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `Here is my context:\n${context}\n\nA schedule has already been laid out for my day:\n${planText}\n\nIn 2-3 warm sentences, summarize this plan and give me ONE practical tip to make the day go smoothly. Do not list the schedule back to me verbatim.`,
        },
      ]
      const reply = await callOpenRouter(apiKey, messages)
      return json({ ok: true, reply })
    }

    // chat mode
    // deno-lint-ignore no-explicit-any
    const history = ((body.history as any[]) ?? []).slice(-6).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content ?? ''),
    }))
    const message = String(body.message ?? '')
    const messages = [
      { role: 'system', content: SYSTEM },
      { role: 'system', content: `Current user context:\n${context}` },
      ...history,
      { role: 'user', content: message },
    ]
    const reply = await callOpenRouter(apiKey, messages)
    return json({ ok: true, reply })
  } catch (e) {
    return json({ ok: false, reply: '', error: (e as Error).message })
  }
})
