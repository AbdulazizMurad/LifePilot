import { useMemo, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import type { Role, EnergyPeak } from '@/lib/types'
import { WEEKDAYS } from '@/lib/ui'
import { guessTimezone } from '@/lib/date'

const ROLES: { value: Role; ic: string; title: string; desc: string }[] = [
  { value: 'student', ic: '🎓', title: 'Student', desc: 'Classes, study blocks, assignments' },
  { value: 'employee', ic: '💼', title: 'Employee', desc: 'Working hours and shifts' },
  { value: 'both', ic: '⚡', title: 'Both', desc: 'Working and studying' },
  { value: 'other', ic: '🌿', title: 'Something else', desc: 'Flexible schedule' },
]

const ENERGY: { value: EnergyPeak; label: string; ic: string }[] = [
  { value: 'morning', label: 'Morning', ic: '🌅' },
  { value: 'afternoon', label: 'Afternoon', ic: '☀️' },
  { value: 'evening', label: 'Evening', ic: '🌙' },
]

function DayPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const toggle = (i: number) =>
    onChange(value.includes(i) ? value.filter((d) => d !== i) : [...value, i].sort())
  return (
    <div className="row wrap" style={{ gap: 6 }}>
      {WEEKDAYS.map((d, i) => (
        <button key={d} type="button" className="chip" data-active={value.includes(i)} onClick={() => toggle(i)}>
          {d}
        </button>
      ))}
    </div>
  )
}

export function OnboardingPage() {
  const { profile, updateProfile } = useAuth()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)

  const [role, setRole] = useState<Role>(profile?.role ?? 'student')
  const [workDays, setWorkDays] = useState<number[]>(
    profile?.work_days?.length ? profile.work_days : [1, 2, 3, 4, 5],
  )
  const [workStart, setWorkStart] = useState(profile?.work_start?.slice(0, 5) ?? '09:00')
  const [workEnd, setWorkEnd] = useState(profile?.work_end?.slice(0, 5) ?? '17:00')
  const [studyDays, setStudyDays] = useState<number[]>(
    profile?.study_days?.length ? profile.study_days : [1, 2, 3, 4, 5],
  )
  const [studyStart, setStudyStart] = useState(profile?.study_start?.slice(0, 5) ?? '18:00')
  const [studyEnd, setStudyEnd] = useState(profile?.study_end?.slice(0, 5) ?? '21:00')
  const [sleepStart, setSleepStart] = useState(profile?.sleep_start?.slice(0, 5) ?? '23:00')
  const [sleepEnd, setSleepEnd] = useState(profile?.sleep_end?.slice(0, 5) ?? '07:00')
  const [energy, setEnergy] = useState<EnergyPeak[]>(
    profile?.energy_peaks?.length ? profile.energy_peaks : ['morning'],
  )
  const toggleEnergy = (v: EnergyPeak) =>
    setEnergy((cur) =>
      cur.includes(v) ? (cur.length > 1 ? cur.filter((x) => x !== v) : cur) : [...cur, v],
    )

  const needsWork = role === 'employee' || role === 'both'
  const needsStudy = role === 'student' || role === 'both'

  // Build the dynamic step list based on the role.
  const steps = useMemo(() => {
    const s: string[] = ['role']
    if (needsWork) s.push('work')
    if (needsStudy) s.push('study')
    s.push('rhythm')
    return s
  }, [needsWork, needsStudy])

  const current = steps[step]
  const isLast = step === steps.length - 1

  const next = () => setStep((s) => Math.min(s + 1, steps.length - 1))
  const back = () => setStep((s) => Math.max(s - 1, 0))

  const finish = async () => {
    setSaving(true)
    await updateProfile({
      role,
      timezone: guessTimezone(),
      work_days: needsWork ? workDays : [],
      work_start: needsWork ? workStart : null,
      work_end: needsWork ? workEnd : null,
      study_days: needsStudy ? studyDays : [],
      study_start: needsStudy ? studyStart : null,
      study_end: needsStudy ? studyEnd : null,
      sleep_start: sleepStart,
      sleep_end: sleepEnd,
      energy_peaks: energy,
      energy_peak: energy[0],
      onboarded: true,
    })
    setSaving(false)
    // AuthProvider reloads the profile; App will route to the app automatically.
  }

  return (
    <div className="ob-wrap">
      <div className="ob-progress">
        {steps.map((s, i) => (
          <span key={s} className={i <= step ? 'on' : ''} />
        ))}
      </div>

      {current === 'role' && (
        <div className="ob-step">
          <h2>Let’s tailor LifePilot to you</h2>
          <p className="muted" style={{ marginBottom: 20 }}>
            This helps the AI schedule tasks around your real life. Which fits you best?
          </p>
          <div className="stack">
            {ROLES.map((r) => (
              <div key={r.value} className="ob-choice" data-active={role === r.value} onClick={() => setRole(r.value)}>
                <span className="ic">{r.ic}</span>
                <div>
                  <strong>{r.title}</strong>
                  <div className="tiny muted">{r.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {current === 'work' && (
        <div className="ob-step">
          <h2>Your working hours</h2>
          <p className="muted" style={{ marginBottom: 20 }}>
            LifePilot won’t schedule personal tasks during work.
          </p>
          <div className="stack">
            <Field label="Working days">
              <DayPicker value={workDays} onChange={setWorkDays} />
            </Field>
            <div className="row" style={{ gap: 12 }}>
              <Field label="Start">
                <TextInput type="time" value={workStart} onChange={(e) => setWorkStart(e.target.value)} />
              </Field>
              <Field label="End">
                <TextInput type="time" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} />
              </Field>
            </div>
          </div>
        </div>
      )}

      {current === 'study' && (
        <div className="ob-step">
          <h2>Your study time</h2>
          <p className="muted" style={{ marginBottom: 20 }}>
            When do you usually study or attend classes?
          </p>
          <div className="stack">
            <Field label="Study days">
              <DayPicker value={studyDays} onChange={setStudyDays} />
            </Field>
            <div className="row" style={{ gap: 12 }}>
              <Field label="Start">
                <TextInput type="time" value={studyStart} onChange={(e) => setStudyStart(e.target.value)} />
              </Field>
              <Field label="End">
                <TextInput type="time" value={studyEnd} onChange={(e) => setStudyEnd(e.target.value)} />
              </Field>
            </div>
          </div>
        </div>
      )}

      {current === 'rhythm' && (
        <div className="ob-step">
          <h2>Your daily rhythm</h2>
          <p className="muted" style={{ marginBottom: 20 }}>
            So we schedule while you’re awake and at your best.
          </p>
          <div className="stack">
            <div className="row" style={{ gap: 12 }}>
              <Field label="Sleep at">
                <TextInput type="time" value={sleepStart} onChange={(e) => setSleepStart(e.target.value)} />
              </Field>
              <Field label="Wake at">
                <TextInput type="time" value={sleepEnd} onChange={(e) => setSleepEnd(e.target.value)} />
              </Field>
            </div>
            <Field label="When are you most focused?" hint="Pick every time of day that applies.">
              <div className="row wrap" style={{ gap: 8 }}>
                {ENERGY.map((e) => (
                  <button
                    key={e.value}
                    type="button"
                    className="chip"
                    data-active={energy.includes(e.value)}
                    onClick={() => toggleEnergy(e.value)}
                  >
                    {e.ic} {e.label}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 10, marginTop: 24 }}>
        {step > 0 && (
          <Button variant="ghost" onClick={back} className="grow">
            Back
          </Button>
        )}
        {!isLast ? (
          <Button variant="primary" onClick={next} className="grow">
            Continue
          </Button>
        ) : (
          <Button variant="primary" onClick={finish} loading={saving} className="grow">
            Start planning →
          </Button>
        )}
      </div>
    </div>
  )
}
