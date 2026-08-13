// Shared presentation metadata (priorities, categories) kept in one place
// so colors/labels stay consistent across every component.
import type { Priority } from './types'

export const PRIORITY_META: Record<Priority, { label: string; color: string; short: string }> = {
  1: { label: 'Low', color: 'var(--p1)', short: 'Low' },
  2: { label: 'Normal', color: 'var(--p2)', short: 'Normal' },
  3: { label: 'High', color: 'var(--p3)', short: 'High' },
  4: { label: 'Urgent', color: 'var(--p4)', short: 'Urgent' },
}

export const CATEGORIES = [
  'general',
  'work',
  'study',
  'personal',
  'health',
  'chore',
  'errand',
  'finance',
  'social',
  'appointment',
] as const

export const CATEGORY_EMOJI: Record<string, string> = {
  general: '📌',
  work: '💼',
  study: '📚',
  personal: '🏠',
  health: '🩺',
  chore: '🧽', // washing the car, laundry, tidying
  errand: '🛒', // going out to buy or collect something
  finance: '💳',
  social: '🧑‍🤝‍🧑',
  appointment: '📅',
}

/** Kept short on purpose — anything else goes through the custom input. */
export const DURATION_PRESETS = [30, 60, 120]

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
