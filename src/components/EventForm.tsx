import { useState } from 'react'
import type { EventItem, EventInput, Recurrence } from '@/lib/types'
import { Field, TextInput, TextArea, Select } from './ui/Field'
import { Button } from './ui/Button'
import { IconTrash } from './ui/icons'

interface Props {
  initial?: EventItem | null
  defaultDay?: Date | null
  onSave: (input: EventInput) => void
  onDelete?: () => void
  onCancel: () => void
}

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16)
}
function fromLocalInput(v: string): string {
  return new Date(v).toISOString()
}
function defaultStart(day: Date | null | undefined): Date {
  const d = day ? new Date(day) : new Date()
  d.setHours(9, 0, 0, 0)
  return d
}

export function EventForm({ initial, defaultDay, onSave, onDelete, onCancel }: Props) {
  const start0 = initial?.start_at ?? defaultStart(defaultDay).toISOString()
  const end0 = initial?.end_at ?? new Date(new Date(start0).getTime() + 60 * 60000).toISOString()

  const [title, setTitle] = useState(initial?.title ?? '')
  const [start, setStart] = useState(toLocalInput(start0))
  const [end, setEnd] = useState(toLocalInput(end0))
  const [location, setLocation] = useState(initial?.location ?? '')
  const [recurrence, setRecurrence] = useState<Recurrence>(initial?.recurrence ?? 'none')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [err, setErr] = useState('')

  const submit = () => {
    if (!title.trim()) return setErr('Give the commitment a name.')
    if (!start || !end) return setErr('Set a start and end time.')
    if (new Date(end) <= new Date(start)) return setErr('End must be after start.')
    onSave({
      title: title.trim(),
      start_at: fromLocalInput(start),
      end_at: fromLocalInput(end),
      location: location.trim() || null,
      recurrence,
      notes: notes.trim() || null,
    })
  }

  return (
    <div className="stack">
      <Field label="Commitment">
        <TextInput
          autoFocus
          placeholder="e.g. Dentist appointment, Lecture, Shift"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <div className="field-row">
        <Field label="Starts">
          <TextInput type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Ends">
          <TextInput type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <div className="field-row">
        <Field label="Location (optional)">
          <TextInput placeholder="Where?" value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
        <Field label="Repeats">
          <Select value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)}>
            <option value="none">Once</option>
            <option value="daily">Every day</option>
            <option value="weekdays">Weekdays</option>
            <option value="weekly">Weekly</option>
          </Select>
        </Field>
      </div>
      <Field label="Notes (optional)">
        <TextArea placeholder="Any details…" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      {err && <div className="error-text">{err}</div>}

      <div className="row" style={{ gap: 10, marginTop: 6 }}>
        {onDelete && (
          <Button variant="danger" onClick={onDelete} aria-label="Delete commitment">
            <IconTrash width={18} height={18} />
          </Button>
        )}
        <Button variant="ghost" onClick={onCancel} className="grow">
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} className="grow">
          {initial ? 'Save' : 'Add commitment'}
        </Button>
      </div>
    </div>
  )
}
