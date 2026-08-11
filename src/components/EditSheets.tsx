import { useData } from '@/context/DataContext'
import { Sheet } from './ui/Sheet'
import { TaskForm } from './TaskForm'
import { EventForm } from './EventForm'
import type { Task, EventItem } from '@/lib/types'

export function TaskEditSheet({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const { updateTask, deleteTask } = useData()
  return (
    <Sheet open={!!task} onClose={onClose} title="Edit task">
      {task && (
        <TaskForm
          initial={task}
          onCancel={onClose}
          onSave={async (input) => {
            await updateTask(task.id, input)
            onClose()
          }}
          onDelete={async () => {
            await deleteTask(task.id)
            onClose()
          }}
        />
      )}
    </Sheet>
  )
}

export function EventEditSheet({ event, onClose }: { event: EventItem | null; onClose: () => void }) {
  const { updateEvent, deleteEvent } = useData()
  return (
    <Sheet open={!!event} onClose={onClose} title="Edit commitment">
      {event && (
        <EventForm
          initial={event}
          onCancel={onClose}
          onSave={async (input) => {
            await updateEvent(event.id, input)
            onClose()
          }}
          onDelete={async () => {
            await deleteEvent(event.id)
            onClose()
          }}
        />
      )}
    </Sheet>
  )
}
