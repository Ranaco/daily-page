export type CellState = 'done' | 'forgiven' | 'miss' | 'future' | 'locked'

export type Task = {
  id: string; label: string; sub: string; time: string
  points: number; spine: boolean; phase: number; done: boolean
}

export type GridRow = {
  habit: { id: string; label: string; time: string; points: number; phase: number; spine: boolean }
  locked: boolean
  cells: CellState[]
  earned: number
}

export type Topic = { id: string; domain: string; text: string }

export type Entry = {
  id: number
  day: string
  habitId: string | null
  habitLabel: string | null
  kind: string
  caption: string | null
  fileId: string | null
  mime: string | null
  width: number | null
  height: number | null
  duration: number | null
  at: string
}

export type JournalMonth = {
  month: string
  total: number
  days: { day: string; items: Entry[] }[]
  months: string[]
}

export type AppState = {
  today: string; weekStart: string; days: string[]
  phase: number; weekIndex: number
  topic: Topic | null
  mode: string | null
  modes: Record<string, number>
  projectLeft: number
  rung: number
  weeksInPhase: number
  holdsLeft: number
  phaseGate: number
  shelfLockedUntil: string | null
  /** Hours since the last cron fired, or null if none ever has. */
  staleHours: number | null
  staleAfter: number
  xp: number; bank: number; level: number; into: number; per: number
  tasks: Task[]
  weekly: (Task & { weekly: boolean })[]
  grid: GridRow[]
  week: { banked: number; available: number; target: number; pct: number; counts: boolean }
  rewards: { id: string; name: string; note: string; cost: number; claimed: boolean; affordable: boolean }[]
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText)
  return res.json() as Promise<T>
}

export const getState = () => req<AppState>('/api/state')

export const toggle = (habitId: string, day: string) =>
  req<{ done: boolean; state: AppState }>('/api/toggle', {
    method: 'POST', body: JSON.stringify({ habitId, day }),
  })

export const claim = (rewardId: string) =>
  req<{ ok: boolean; state: AppState }>('/api/claim', {
    method: 'POST', body: JSON.stringify({ rewardId }),
  })

export const getJournal = (month?: string) =>
  req<JournalMonth>(`/api/journal${month ? `?month=${month}` : ''}`)

export const addNote = (caption: string, habitId?: string | null) =>
  req<{ ok: boolean; loggedNow: boolean }>('/api/journal', {
    method: 'POST', body: JSON.stringify({ caption, habitId: habitId ?? null }),
  })

export const removeEntry = (id: number) =>
  req<{ ok: boolean }>(`/api/journal?id=${id}`, { method: 'DELETE' })

/** Media streams through our own origin — Telegram's URL carries the bot token. */
export const fileUrl = (id: number) => `/api/file?id=${id}`
