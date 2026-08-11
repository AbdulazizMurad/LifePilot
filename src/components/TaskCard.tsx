import type { Task } from '@/lib/types'
import { PRIORITY_META, CATEGORY_EMOJI } from '@/lib/ui'
import { IconCheck, IconClock, IconFlag } from './ui/icons'
import { deadlineLabel, durationLabel, fmtTime } from '@/lib/date'

interface Props {
  task: Task
  onToggle: (t: Task) => void
  onOpen: (t: Task) => void
  showSchedule?: boolean
}

export function TaskCard({ task, onToggle, onOpen, showSchedule }: Props) {
  const pm = PRIORITY_META[task.priority]
  const done = task.status === 'done'
  const dl = task.deadline ? deadlineLabel(task.deadline) : null

  return (
    <div
      className={`task ${done ? 'done' : ''}`}
      style={{ borderLeftColor: pm.color }}
    >
      <button
        className="task-check"
        data-done={done}
        aria-label={done ? 'Mark not done' : 'Mark done'}
        onClick={(e) => {
          e.stopPropagation()
          onToggle(task)
        }}
      >
        {done && <IconCheck width={14} height={14} color="#0b0f1a" />}
      </button>

      <div className="task-body" onClick={() => onOpen(task)} role="button">
        <div className="task-title">
          <span style={{ marginRight: 6 }}>{CATEGORY_EMOJI[task.category] ?? '📌'}</span>
          {task.title}
        </div>
        <div className="task-meta">
          <span className="meta-pill">
            <IconClock width={12} height={12} /> {durationLabel(task.duration_minutes)}
          </span>
          <span className="meta-pill" style={{ color: pm.color }}>
            <IconFlag width={12} height={12} /> {pm.short}
          </span>
          {dl && (
            <span className={`meta-pill ${dl.tone === 'overdue' ? 'overdue' : dl.tone === 'soon' ? 'soon' : ''}`}>
              {dl.text}
            </span>
          )}
          {showSchedule && task.scheduled_start && (
            <span className="meta-pill" style={{ color: 'var(--accent)' }}>
              {fmtTime(task.scheduled_start)}
            </span>
          )}
        </div>
        {task.ai_reason && showSchedule && (
          <div className="tiny dim" style={{ marginTop: 6, fontStyle: 'italic' }}>
            ✨ {task.ai_reason}
          </div>
        )}
      </div>
    </div>
  )
}
