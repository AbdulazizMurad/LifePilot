// =========================================================
// Shared domain types (mirror the Supabase schema)
// =========================================================

export type Role = 'student' | 'employee' | 'both' | 'other'
export type EnergyPeak = 'morning' | 'afternoon' | 'evening'
export type Priority = 1 | 2 | 3 | 4 // 1=low, 2=normal, 3=high, 4=urgent
export type TaskStatus = 'todo' | 'scheduled' | 'in_progress' | 'done'
export type Recurrence = 'none' | 'daily' | 'weekly' | 'weekdays'

export interface Profile {
  id: string
  full_name: string | null
  role: Role
  timezone: string
  work_days: number[] // 0=Sun ... 6=Sat
  work_start: string | null // 'HH:MM' or 'HH:MM:SS'
  work_end: string | null
  study_days: number[]
  study_start: string | null
  study_end: string | null
  sleep_start: string
  sleep_end: string
  /** Times of day the user is sharpest — they may pick more than one. */
  energy_peaks: EnergyPeak[]
  /** @deprecated superseded by energy_peaks; kept until old clients age out. */
  energy_peak: EnergyPeak
  onboarded: boolean
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  user_id: string
  title: string
  notes: string | null
  deadline: string | null // ISO
  duration_minutes: number
  priority: Priority
  status: TaskStatus
  category: string
  scheduled_start: string | null // ISO
  scheduled_end: string | null // ISO
  ai_reason: string | null
  created_at: string
  updated_at: string
}

export interface EventItem {
  id: string
  user_id: string
  title: string
  start_at: string // ISO
  end_at: string // ISO
  location: string | null
  recurrence: Recurrence
  notes: string | null
  created_at: string
  updated_at: string
}

// Data used to create/update rows (no server-managed fields)
export type TaskInput = Partial<
  Pick<
    Task,
    | 'title'
    | 'notes'
    | 'deadline'
    | 'duration_minutes'
    | 'priority'
    | 'status'
    | 'category'
    | 'scheduled_start'
    | 'scheduled_end'
    | 'ai_reason'
  >
>

export type EventInput = Partial<
  Pick<EventItem, 'title' | 'start_at' | 'end_at' | 'location' | 'recurrence' | 'notes'>
>

// AI schedule proposal returned by the organizer
export interface ScheduleBlock {
  task_id: string
  title: string
  start: string // ISO
  end: string // ISO
  reason: string
}

export interface OrganizerResult {
  summary: string
  blocks: ScheduleBlock[]
  advice?: string
  /** Blocks dropped because they collided with the user's real availability. */
  rejected?: string[]
}
