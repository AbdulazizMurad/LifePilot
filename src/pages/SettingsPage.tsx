import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { Header } from '@/components/Header'
import { Button } from '@/components/ui/Button'
import { Field, TextInput, Select } from '@/components/ui/Field'
import type { Role, EnergyPeak } from '@/lib/types'
import { WEEKDAYS } from '@/lib/ui'
import { IconLogout } from '@/components/ui/icons'

const ENERGY_OPTIONS: { value: EnergyPeak; label: string; ic: string }[] = [
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

export function SettingsPage() {
  const { profile, user, updateProfile, signOut } = useAuth()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [role, setRole] = useState<Role>(profile?.role ?? 'other')
  const [workDays, setWorkDays] = useState<number[]>(profile?.work_days ?? [1, 2, 3, 4, 5])
  const [workStart, setWorkStart] = useState(profile?.work_start?.slice(0, 5) ?? '09:00')
  const [workEnd, setWorkEnd] = useState(profile?.work_end?.slice(0, 5) ?? '17:00')
  const [studyDays, setStudyDays] = useState<number[]>(profile?.study_days ?? [])
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

  const save = async () => {
    setSaving(true)
    setSaved(false)
    await updateProfile({
      full_name: fullName.trim() || null,
      role,
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
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="page">
      <Header title="Settings" subtitle={user?.email ?? ''} />

      <div className="card stack">
        <Field label="Your name">
          <TextInput value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="I am a…">
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="student">🎓 Student</option>
            <option value="employee">💼 Employee</option>
            <option value="both">⚡ Both</option>
            <option value="other">🌿 Something else</option>
          </Select>
        </Field>
      </div>

      {needsWork && (
        <>
          <div className="section-title">Working hours</div>
          <div className="card stack">
            <Field label="Working days">
              <DayPicker value={workDays} onChange={setWorkDays} />
            </Field>
            <div className="field-row">
              <Field label="Start">
                <TextInput type="time" value={workStart} onChange={(e) => setWorkStart(e.target.value)} />
              </Field>
              <Field label="End">
                <TextInput type="time" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} />
              </Field>
            </div>
          </div>
        </>
      )}

      {needsStudy && (
        <>
          <div className="section-title">Study hours</div>
          <div className="card stack">
            <Field label="Study days">
              <DayPicker value={studyDays} onChange={setStudyDays} />
            </Field>
            <div className="field-row">
              <Field label="Start">
                <TextInput type="time" value={studyStart} onChange={(e) => setStudyStart(e.target.value)} />
              </Field>
              <Field label="End">
                <TextInput type="time" value={studyEnd} onChange={(e) => setStudyEnd(e.target.value)} />
              </Field>
            </div>
          </div>
        </>
      )}

      <div className="section-title">Daily rhythm</div>
      <div className="card stack">
        <div className="field-row">
          <Field label="Sleep at">
            <TextInput type="time" value={sleepStart} onChange={(e) => setSleepStart(e.target.value)} />
          </Field>
          <Field label="Wake at">
            <TextInput type="time" value={sleepEnd} onChange={(e) => setSleepEnd(e.target.value)} />
          </Field>
        </div>
        <Field label="Most focused" hint="Pick every time of day that applies.">
          <div className="row wrap" style={{ gap: 8 }}>
            {ENERGY_OPTIONS.map((e) => (
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

      <div className="stack" style={{ marginTop: 18 }}>
        <Button variant="primary" block loading={saving} onClick={save}>
          {saved ? 'Saved ✓' : 'Save changes'}
        </Button>
        <Button variant="danger" block onClick={() => signOut()}>
          <IconLogout width={18} height={18} /> Sign out
        </Button>
      </div>

      <p className="tiny dim" style={{ textAlign: 'center', marginTop: 18 }}>
        LifePilot · Install to your home screen from your browser menu for the full app experience.
        <br />
        Build {__BUILD_ID__}
      </p>
    </div>
  )
}
