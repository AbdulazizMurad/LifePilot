import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthContext'
import type { Task, EventItem, TaskInput, EventInput } from '@/lib/types'

interface DataState {
  tasks: Task[]
  events: EventItem[]
  loading: boolean
  refresh: () => Promise<void>
  addTask: (input: TaskInput) => Promise<Task | null>
  updateTask: (id: string, patch: TaskInput) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  toggleDone: (task: Task) => Promise<void>
  addEvent: (input: EventInput) => Promise<EventItem | null>
  updateEvent: (id: string, patch: EventInput) => Promise<void>
  deleteEvent: (id: string) => Promise<void>
}

const DataContext = createContext<DataState | undefined>(undefined)

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [events, setEvents] = useState<EventItem[]>([])
  // Starts true: the first load is already on its way, and screens that branch
  // on "does this user have anything yet" must not decide on an empty array.
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!user) {
      setTasks([])
      setEvents([])
      setLoading(false)
      return
    }
    setLoading(true)
    const [t, e] = await Promise.all([
      supabase.from('tasks').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('events').select('*').eq('user_id', user.id).order('start_at', { ascending: true }),
    ])
    setTasks((t.data as Task[]) ?? [])
    setEvents((e.data as EventItem[]) ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => {
    refresh()
  }, [refresh])

  const addTask = useCallback(
    async (input: TaskInput): Promise<Task | null> => {
      if (!user) return null
      const { data, error } = await supabase
        .from('tasks')
        .insert({ ...input, user_id: user.id })
        .select()
        .single()
      if (error || !data) return null
      const task = data as Task
      setTasks((prev) => [task, ...prev])
      return task
    },
    [user],
  )

  const updateTask = useCallback(async (id: string, patch: TaskInput) => {
    // optimistic
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } as Task : t)))
    await supabase.from('tasks').update(patch).eq('id', id)
  }, [])

  const deleteTask = useCallback(async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id))
    await supabase.from('tasks').delete().eq('id', id)
  }, [])

  const toggleDone = useCallback(async (task: Task) => {
    const next = task.status === 'done' ? 'todo' : 'done'
    const completed_at = next === 'done' ? new Date().toISOString() : null
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: next, completed_at } : t)),
    )
    await supabase.from('tasks').update({ status: next, completed_at }).eq('id', task.id)
  }, [])

  const addEvent = useCallback(
    async (input: EventInput): Promise<EventItem | null> => {
      if (!user) return null
      const { data, error } = await supabase
        .from('events')
        .insert({ ...input, user_id: user.id })
        .select()
        .single()
      if (error || !data) return null
      const ev = data as EventItem
      setEvents((prev) => [...prev, ev].sort((a, b) => a.start_at.localeCompare(b.start_at)))
      return ev
    },
    [user],
  )

  const updateEvent = useCallback(async (id: string, patch: EventInput) => {
    setEvents((prev) =>
      prev
        .map((e) => (e.id === id ? ({ ...e, ...patch } as EventItem) : e))
        .sort((a, b) => a.start_at.localeCompare(b.start_at)),
    )
    await supabase.from('events').update(patch).eq('id', id)
  }, [])

  const deleteEvent = useCallback(async (id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id))
    await supabase.from('events').delete().eq('id', id)
  }, [])

  return (
    <DataContext.Provider
      value={{
        tasks,
        events,
        loading,
        refresh,
        addTask,
        updateTask,
        deleteTask,
        toggleDone,
        addEvent,
        updateEvent,
        deleteEvent,
      }}
    >
      {children}
    </DataContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useData(): DataState {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
