import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { AppState, claim, getState, toggle } from './api.js'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MARK: Record<string, string> = { done: '✓', forgiven: '–', miss: '', future: '', locked: '' }
const PHASE_NAMES = ['', 'The clock', 'The body', 'The mind', 'The world']
const UNLOCK_WEEK: Record<number, number> = { 2: 2, 3: 3, 4: 4 }

type Tab = 'today' | 'week' | 'rewards'

export default function App() {
  const [state, setState] = useState<AppState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('today')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try { setState(await getState()); setError(null) }
    catch (e) { setError((e as Error).message) }
  }, [])

  useEffect(() => { load() }, [load])

  // The day rolls over at 4am; re-fetch on focus so a phone left open is never stale.
  useEffect(() => {
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  if (error === 'unauthorized') return <Gate />
  if (error) return <Shell><div className="panel note"><h3>Could not load</h3><p>{error}</p></div></Shell>
  if (!state) return <Shell><div className="panel note"><p>Loading…</p></div></Shell>

  async function onToggle(habitId: string, points: number, wasDone: boolean) {
    if (busy) return
    setBusy(habitId)
    try {
      const { state: next } = await toggle(habitId, state!.today)
      if (!wasDone) burst(`+${points}`)
      setState(next)
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(null) }
  }

  async function onClaim(rewardId: string) {
    if (busy) return
    setBusy(rewardId)
    try {
      const { state: next } = await claim(rewardId)
      burst('CLAIMED!')
      setState(next)
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(null) }
  }

  return (
    <Shell>
      <header>
        <div className="titlebar">
          <h1>THE DAILY PAGE</h1>
          <div className="datechip tiny">
            Week {state.weekIndex + 1} · Phase {state.phase} · {PHASE_NAMES[state.phase]}
          </div>
        </div>

        <div className="hud">
          <div className="panel">
            <span className="tiny">Level</span>
            <div className="lvlrow">
              <span className="bang">{state.level}</span>
              <span className="xp">{state.into} / {state.per} XP</span>
            </div>
            <div className="meter"><i style={{ width: `${(state.into / state.per) * 100}%` }} /></div>
          </div>
          <div className="panel">
            <span className="tiny">Points to spend</span>
            <span className="bignum">{state.bank}</span>
          </div>
          <div className="panel">
            <span className="tiny">This week</span>
            <span className={'bignum' + (state.week.counts ? ' g' : '')}>{state.week.pct}%</span>
            <span className="tiny" style={{ color: 'var(--muted)' }}>
              {state.week.banked}/{state.week.available} · counts at 80
            </span>
          </div>
        </div>
      </header>

      <nav role="tablist">
        {(['today', 'week', 'rewards'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {t === 'today' ? 'Today' : t === 'week' ? 'The Grid' : 'Rewards'}
          </button>
        ))}
      </nav>

      {tab === 'today' && (
        <div className="view on">
          <div className="tasks">
            {state.tasks.map((t) => (
              <button
                key={t.id}
                className="task"
                data-done={t.done ? '1' : '0'}
                disabled={busy === t.id}
                onClick={() => onToggle(t.id, t.points, t.done)}
              >
                <span className="t">{t.time}</span>
                <span className="lbl">
                  {t.label}{t.spine && <span className="spine">SPINE</span>}
                </span>
                <span className="pts">{t.done ? '✓' : `+${t.points}`}</span>
                <span className="sub">{t.sub}</span>
              </button>
            ))}
          </div>

          {state.staleHours !== null && state.staleHours > state.staleAfter && (
            <div className="panel note">
              <h3>The bot has not been pushed in {Math.round(state.staleHours)} hours</h3>
              <p>
                That is the scheduler, not you. Check the three jobs at cron-job.org before
                reading the gaps in this grid as your own.
              </p>
            </div>
          )}

          {state.topic && (
            <div className="panel note">
              <h3>Saturday · {state.topic.text}</h3>
              <p>
                {state.topic.domain} — ten minutes reading, five writing by hand, then two
                minutes to camera. No AI at any stage.
              </p>
            </div>
          )}

          {state.weekly.length > 0 && (
            <>
              <h2 style={{ marginTop: 8 }}>This week</h2>
              <div className="tasks">
                {state.weekly.map((t) => (
                  <button
                    key={t.id}
                    className="task"
                    data-done={t.done ? '1' : '0'}
                    disabled={busy === t.id}
                    onClick={() => onToggle(t.id, t.points, t.done)}
                  >
                    <span className="t">{t.time}</span>
                    <span className="lbl">{t.label}</span>
                    <span className="pts">{t.done ? '✓' : `+${t.points}`}</span>
                    <span className="sub">{t.sub}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {state.phase < 4 && (
            <div className="panel note">
              <h3>Phase {state.phase + 1} opens in week {UNLOCK_WEEK[state.phase + 1]}</h3>
              <p>
                It unlocks on time, not on performance — you cannot open it early by having
                a good week. The lock is protecting you from enthusiasm, not punishing you
                for slipping.
              </p>
            </div>
          )}
        </div>
      )}

      {tab === 'week' && (
        <div className="view on">
          <div className="panel gridwrap">
            <table>
              <thead>
                <tr>
                  <th />
                  {state.days.map((d, i) => (
                    <th key={d} className={d === state.today ? 'today' : ''}>{DAYS[i]}</th>
                  ))}
                  <th>Pts</th>
                </tr>
              </thead>
              <tbody>
                {state.grid.map((g) => (
                  <tr key={g.habit.id}>
                    <th>{g.habit.label}<small>{g.habit.time} · {g.habit.points} pts</small></th>
                    {g.cells.map((c, i) => (
                      <td key={i}>
                        <div className={`cell ${c === 'locked' ? 'lockedcell' : c}${state.days[i] === state.today ? ' now' : ''}`}>
                          {MARK[c]}
                        </div>
                      </td>
                    ))}
                    <td className="total"><div className="cell">{g.locked ? '–' : g.earned}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="legend2">
              <span><i style={{ background: 'var(--green)' }} /> done</span>
              <span><i style={{ background: 'var(--panel)' }} /> missed</span>
              <span><i style={{ background: 'var(--yellow)' }} /> forgiven — first miss, no penalty</span>
              <span><i style={{ background: 'var(--sunk)', borderColor: 'var(--locked)' }} /> not yet</span>
            </div>
          </div>

          <div className="panel note">
            <h3>The week is what gets scored</h3>
            <p>
              Hit <strong>80% of available points</strong> and the week counts, which means one
              wrecked Tuesday gets absorbed instead of ending the run. Daily all-or-nothing
              scoring is what turns a bad day into a quit.
            </p>
          </div>
        </div>
      )}

      {tab === 'rewards' && (
        <div className="view on">
          <div className="panel note">
            <h3>Points have to buy something real</h3>
            <p>
              Once something is on this shelf, you don't buy it any other way. That's what
              gives the points teeth. Edit the list in <code>server/config.ts</code>.
            </p>
          </div>
          <div className="shelf">
            {state.rewards.map((r) => (
              <div className="panel rw" key={r.id}>
                <span className="cost">{r.cost}</span>
                <b>{r.name}</b>
                <p>{r.note}</p>
                <button
                  disabled={!r.affordable || r.claimed || busy === r.id}
                  onClick={() => onClaim(r.id)}
                >
                  {r.claimed ? 'CLAIMED' : r.affordable ? 'CLAIM IT' : `${r.cost - state.bank} TO GO`}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="wrap">{children}</div>
}

function Gate() {
  const [key, setKey] = useState('')
  return (
    <div className="wrap">
      <header><div className="titlebar"><h1>THE DAILY PAGE</h1></div></header>
      <div className="panel note">
        <h3>Sign in</h3>
        <p>Paste your <code>APP_SECRET</code>. It's stored in a cookie and you'll only do this once per device.</p>
        <form
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
          onSubmit={(e) => { e.preventDefault(); window.location.href = `/api/login?key=${encodeURIComponent(key)}` }}
        >
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="APP_SECRET"
            style={{
              flex: 1, minWidth: 200, padding: '9px 12px', font: 'inherit',
              border: '3px solid var(--outline)', borderRadius: 3,
              background: 'var(--panel)', color: 'var(--ink)',
            }}
          />
          <button type="submit" className="gatebtn">GO</button>
        </form>
      </div>
    </div>
  )
}

let burstTimer: number | undefined
function burst(text: string) {
  const el = document.getElementById('burst')
  if (!el) return
  el.textContent = text
  el.classList.remove('go')
  void el.offsetWidth
  el.classList.add('go')
  window.clearTimeout(burstTimer)
  burstTimer = window.setTimeout(() => el.classList.remove('go'), 760)
}
