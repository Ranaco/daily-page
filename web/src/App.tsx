import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  AppState, Entry, JournalMonth, addNote, claim, fileUrl, getJournal,
  getState, removeEntry, toggle,
} from './api.js'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MARK: Record<string, string> = { done: '✓', forgiven: '–', miss: '', future: '', locked: '' }
const PHASE_NAMES = ['', 'The clock', 'The body', 'The mind', 'The world']

type Tab = 'today' | 'week' | 'rewards' | 'journal'

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
        {(['today', 'week', 'rewards', 'journal'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {t === 'today' ? 'Today' : t === 'week' ? 'The Grid'
              : t === 'rewards' ? 'Rewards' : 'Journal'}
          </button>
        ))}
      </nav>

      {tab === 'journal' && <Journal onSaved={load} />}

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
              <h3>
                Phase {state.phase + 1} opens at {Math.round(state.phaseGate * 100)}%
                {state.week.pct >= state.phaseGate * 100 ? ' — clear as it stands' : ''}
              </h3>
              <p>
                Week {state.weeksInPhase + 1} of phase {state.phase}. You cannot open the next
                one early by having a good week — the lock is there to stop everything starting
                at once. But an under-gate week holds it, and after{' '}
                {state.holdsLeft === 0 ? 'this one' : `${state.holdsLeft} more`} it opens
                regardless. It can hold you back; it cannot strand you.
              </p>
            </div>
          )}

          {state.shelfLockedUntil && (
            <div className="panel note">
              <h3>Shelf locked</h3>
              <p>
                Last week came in under 80%, so spending is paused until Monday. Points keep
                banking as normal — nothing is lost, it just waits.
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


// ===================================================================== journal

const MONTH_NAMES = ['January','February','March','April','May','June','July',
  'August','September','October','November','December']

function monthLabel(m: string) {
  const [y, mm] = m.split('-').map(Number)
  return `${MONTH_NAMES[(mm ?? 1) - 1]} ${y}`
}

function dayLabel(iso: string) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  })
}

function timeLabel(at: string) {
  return new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function secs(n: number | null) {
  if (!n) return null
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`
}

/**
 * The journal.
 *
 * One month at a time, fully loaded at first paint — no lazy-load, no
 * IntersectionObserver, no "load more". The set is bounded and knowable, which
 * keeps the scrollbar honest and lets the page actually end. The last element
 * in the DOM is the end marker, with nothing after it that could later be
 * filled.
 *
 * Deliberately absent: any adherence number. The Grid already scores
 * compliance; this surface is only what you made. Keeping the two jobs apart
 * is also what stops the two tabs disagreeing about a given Tuesday.
 */
function Journal({ onSaved }: { onSaved: () => void }) {
  const [data, setData] = useState<JournalMonth | null>(null)
  const [month, setMonth] = useState<string | undefined>(undefined)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async (m?: string) => {
    try { setData(await getJournal(m)); setErr(null) }
    catch (e) { setErr((e as Error).message) }
  }, [])

  useEffect(() => { load(month) }, [load, month])

  async function save() {
    const body = text.trim()
    if (!body || busy) return
    setBusy(true)
    try {
      await addNote(body)
      setText('')
      await load(month)
      onSaved()          // the entry silently ticked `log`; refresh the shell
    } catch (e) { setErr((e as Error).message) }
    finally { setBusy(false) }
  }

  async function drop(id: number) {
    if (busy) return
    setBusy(true)
    try { await removeEntry(id); await load(month) }
    catch (e) { setErr((e as Error).message) }
    finally { setBusy(false) }
  }

  if (err) return <div className="j"><div className="j-empty">Could not load the journal. {err}</div></div>
  if (!data) return <div className="j"><div className="j-empty">Loading…</div></div>

  const current = data.month

  return (
    <div className="j">
      <h1 className="j-month">
        {monthLabel(current)} <span>· {data.total} {data.total === 1 ? 'entry' : 'entries'}</span>
      </h1>

      <div className="j-write">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What happened. What you felt, and where. One thing tomorrow."
          aria-label="Write a journal entry"
        />
        <div className="row">
          <button className="j-save" onClick={save} disabled={!text.trim() || busy}>Save</button>
          <span className="j-hint">Send the bot a photo or video, or use /proof to pick a task first.</span>
        </div>
      </div>

      {data.days.length === 0 && (
        <div className="j-empty">
          Nothing filed in {monthLabel(current)} yet.<br />
          Write a line above, or send the bot a photo of what you made.
        </div>
      )}

      {data.days.map((d) => (
        <div className="j-day" key={d.day}>
          <div className="j-date">{dayLabel(d.day)}</div>
          {d.items.map((e) => <Card key={e.id} entry={e} onDelete={() => drop(e.id)} />)}
        </div>
      ))}

      {data.months.length > 1 && (
        <div className="j-months">
          {data.months.map((m) => (
            <button key={m} aria-current={m === current} onClick={() => setMonth(m)}>
              {monthLabel(m)}
            </button>
          ))}
        </div>
      )}

      <div className="j-end">
        {data.total > 0
          ? `That's ${monthLabel(current)}.`
          : 'Nothing here yet.'}
      </div>
    </div>
  )
}

function Card({ entry, onDelete }: { entry: Entry; onDelete: () => void }) {
  const src = fileUrl(entry.id)
  return (
    <div className="j-card">
      {entry.kind === 'photo' && (
        <div className="j-media">
          <img src={src} alt={entry.caption ?? 'Journal photo'} loading="lazy" />
        </div>
      )}
      {entry.kind === 'video' && (
        <div className="j-media">
          {/* preload=metadata, never autoplay — this is not a feed */}
          <video src={src} controls preload="metadata" playsInline />
        </div>
      )}
      {(entry.kind === 'voice' || entry.kind === 'audio') && (
        <div className="j-media"><audio src={src} controls preload="metadata" /></div>
      )}
      {entry.kind === 'file' && (
        <a className="j-file" href={src}>📎 {entry.caption ?? 'Attachment'}</a>
      )}

      {entry.caption && entry.kind !== 'file' && <p>{entry.caption}</p>}

      <div className="j-meta">
        {entry.habitLabel && <span className="j-chip">{entry.habitLabel}</span>}
        <span>{timeLabel(entry.at)}</span>
        {secs(entry.duration) && <span>· {secs(entry.duration)}</span>}
        <button className="j-del" onClick={onDelete} aria-label="Delete this entry">Delete</button>
      </div>
    </div>
  )
}
