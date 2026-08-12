import { useState } from 'react'
import type { Task, TaskInput, Priority } from '@/lib/types'
import { Field, TextInput, TextArea, Select } from './ui/Field'
import { Button } from './ui/Button'
import { Segmented } from './ui/Segmented'
import { PRIORITY_META, CATEGORIES, CATEGORY_EMOJI, DURATION_PRESETS } from '@/lib/ui'
import { durationLabel } from '@/lib/date'
import { IconTrash } from './ui/icons'

interface Props {
  initial?: Task | null
  defaultDeadline?: Date | null
  onSave: (input: TaskInput) => void
  onDelete?: () => void
  onCancel: () => void
}

// ISO <-> value for <input type="datetime-local">
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16)
}
function fromLocalInput(v: string): string | null {
  if (!v) return null
  return new Date(v).toISOString()
}

export function TaskForm({ initial, defaultDeadline, onSave, onDelete, onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [category, setCategory] = useState(initial?.category ?? 'general')
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? 2)
  const [duration, setDuration] = useState<number>(initial?.duration_minutes ?? 30)
  // Custom stays open when editing a task whose duration isn't one of the presets.
  const [custom, setCustom] = useState(
    initial ? !DURATION_PRESETS.includes(initial.duration_minutes) : false,
  )
  const [deadline, setDeadline] = useState<string>(
    toLocalInput(initial?.deadline ?? (defaultDeadline ? defaultDeadline.toISOString() : null)),
  )
  const [err, setErr] = useState('')

  const submit = () => {
    if (!title.trim()) {
      setErr('Give your task a name.')
      return
    }
    onSave({
      title: title.trim(),
      notes: notes.trim() || null,
      category,
      priority,
      duration_minutes: duration,
      deadline: fromLocalInput(deadline),
    })
  }

  return (
    <div className="stack">
      <Field label="What needs doing?">
        <TextInput
          autoFocus
          placeholder="e.g. Finish stats assignment"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>

      <Field label="Priority">
        <Segmented
          value={priority}
          onChange={(v) => setPriority(v as Priority)}
          options={([1, 2, 3, 4] as Priority[]).map((p) => ({ value: p, label: PRIORITY_META[p].short }))}
        />
      </Field>

      <Field label="Estimated time">
        <div className="row wrap" style={{ gap: 8 }}>
          {DURATION_PRESETS.map((d) => (
            <button
              key={d}
              type="button"
              className="chip"
              data-active={!custom && duration === d}
              onClick={() => {
                setCustom(false)
                setDuration(d)
              }}
            >
              {durationLabel(d)}
            </button>
          ))}
          <button type="button" className="chip" data-active={custom} onClick={() => setCustom(true)}>
            Custom…
          </button>
        </div>

        {custom && (
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <TextInput
              type="number"
              min={5}
              max={600}
              step={5}
              autoFocus
              value={duration}
              onChange={(e) => setDuration(Math.max(5, Math.min(600, Number(e.target.value) || 0)))}
              style={{ maxWidth: 120 }}
            />
            <span className="small muted">minutes ({durationLabel(duration)})</span>
          </div>
        )}
      </Field>

      <div className="row" style={{ gap: 12 }}>
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_EMOJI[c]} {c[0].toUpperCase() + c.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Deadline (optional)">
          <TextInput type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </Field>
      </div>

      <Field label="Notes (optional)">
        <TextArea placeholder="Any details…" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      {err && <div className="error-text">{err}</div>}

      <div className="row" style={{ gap: 10, marginTop: 6 }}>
        {onDelete && (
          <Button variant="danger" onClick={onDelete} aria-label="Delete task">
            <IconTrash width={18} height={18} />
          </Button>
        )}
        <Button variant="ghost" onClick={onCancel} className="grow">
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} className="grow">
          {initial ? 'Save' : 'Add task'}
        </Button>
      </div>
    </div>
  )
}
