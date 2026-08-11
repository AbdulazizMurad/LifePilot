import { useState } from 'react'
import { useData } from '@/context/DataContext'
import { Sheet } from './ui/Sheet'
import { Button } from './ui/Button'
import { TaskForm } from './TaskForm'
import { EventForm } from './EventForm'
import { IconPlus } from './ui/icons'

type Which = null | 'menu' | 'task' | 'event'

/** Floating action button + create sheets, available on every main screen. */
export function QuickAdd({ defaultDay }: { defaultDay?: Date }) {
  const { addTask, addEvent } = useData()
  const [which, setWhich] = useState<Which>(null)

  return (
    <>
      <button className="fab" aria-label="Add" onClick={() => setWhich('menu')}>
        <IconPlus />
      </button>

      <Sheet open={which === 'menu'} onClose={() => setWhich(null)} title="Add to your plan">
        <div className="stack">
          <div className="ob-choice" onClick={() => setWhich('task')}>
            <span className="ic">✅</span>
            <div>
              <strong>Task</strong>
              <div className="tiny muted">Something to do — LifePilot schedules it for you</div>
            </div>
          </div>
          <div className="ob-choice" onClick={() => setWhich('event')}>
            <span className="ic">📅</span>
            <div>
              <strong>Fixed commitment</strong>
              <div className="tiny muted">A set-time appointment, class or shift</div>
            </div>
          </div>
          <Button variant="ghost" block onClick={() => setWhich(null)}>
            Cancel
          </Button>
        </div>
      </Sheet>

      <Sheet open={which === 'task'} onClose={() => setWhich(null)} title="New task">
        <TaskForm
          defaultDeadline={defaultDay}
          onCancel={() => setWhich(null)}
          onSave={async (input) => {
            await addTask({ ...input, status: 'todo' })
            setWhich(null)
          }}
        />
      </Sheet>

      <Sheet open={which === 'event'} onClose={() => setWhich(null)} title="New commitment">
        <EventForm
          defaultDay={defaultDay}
          onCancel={() => setWhich(null)}
          onSave={async (input) => {
            await addEvent(input)
            setWhich(null)
          }}
        />
      </Sheet>
    </>
  )
}
