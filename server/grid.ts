import type { AppState } from './store.js'
import { esc } from './telegram.js'

const GLYPH: Record<string, string> = {
  done: '█', forgiven: '▒', miss: '·', future: ' ', locked: '/',
}

/**
 * The week grid, in a monospace block Telegram will render faithfully.
 * Same four states as the website, same meaning.
 */
export function gridText(state: AppState): string {
  const width = Math.max(...state.grid.map((g) => g.habit.label.length), 8)
  const head = ' '.repeat(width + 1) + 'M T W T F S S   pts'
  const lines = state.grid.map((g) => {
    const name = g.habit.label.padEnd(width).slice(0, width)
    const cells = g.cells.map((c) => GLYPH[c] ?? '·').join(' ')
    const pts = g.locked ? '  –' : String(g.earned).padStart(3)
    return `${name} ${cells} ${pts}`
  })

  const footer = [
    '',
    `${state.week.banked}/${state.week.available} — ${state.week.pct}%  (counts at 80%)`,
  ]

  return [
    `<b>Week ${state.weekIndex + 1} · Phase ${state.phase}</b>`,
    '<pre>' + esc([head, ...lines, ...footer].join('\n')) + '</pre>',
    '█ done   ▒ forgiven   · missed   / locked',
  ].join('\n')
}
