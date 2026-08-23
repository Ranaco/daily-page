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

export type AppState = {
  today: string; weekStart: string; days: string[]
  phase: number; weekIndex: number
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
