import type { Episode } from '../types'
import { UI } from '../strings'

export type View = 'full' | 'nochat' | 'transcript'
export type Mode = 'replay' | 'live'

interface HeaderProps {
  episode: Episode
  view: View
  onView: (v: View) => void
  mode: Mode
  onMode: (m: Mode) => void
  /** Open the searchable episode browser (clicking the EP label). */
  onOpenBrowser: () => void
}

const VIEW_DEFS: { id: View; label: string }[] = [
  { id: 'full', label: UI.views.full },
  { id: 'nochat', label: UI.views.nochat },
  { id: 'transcript', label: UI.views.transcript },
]

export function Header({ episode, view, onView, mode, onOpenBrowser }: HeaderProps) {
  const isLive = mode === 'live'
  const last = episode.turns[episode.turns.length - 1]
  const runtimeMin = last ? Math.round((last.startMs + last.durationMs) / 60000) : 0
  return (
    <header className="header">
      <div className="header__left">
        {/* The wordmark is home: back to the landing / connect guide. */}
        <a className="wordmark wordmark--home" href="/" title="Home">{UI.brand}</a>
        <div className="header__divider" />
        {/* Two top-level places, never a hidden toggle: Lives vs Episodes. */}
        <nav className="navtabs">
          <a className={`navtab${isLive ? ' is-active' : ''}`} href="#live" title="Live channels">
            <span className="navtab__dot" />LIVES
          </a>
          <a className={`navtab${!isLive ? ' is-active' : ''}`} href="#episodes" title="Recorded episodes">
            EPISODES
          </a>
        </nav>
      </div>

      <div className="header__right">
        {!isLive && (
          <button className="ep-browse" onClick={onOpenBrowser} title="Browse episodes">
            <span className="ep-browse__icon">▤</span>
            <span className="ep-browse__num">{episode.number}</span>
            <span className="ep-browse__label">EPISODES</span>
            <span className="ep-browse__caret">▾</span>
          </button>
        )}

        {/* Honest runtime, not a vanity listener count. Live listener numbers
            are real and shown in the live bar; here (replay) we surface length. */}
        {!isLive && (
          <div className="meta">
            <span className="meta__count">{runtimeMin || '—'}</span>
            <span>MIN</span>
          </div>
        )}

        <div className="viewtoggle">
          {VIEW_DEFS.map((v) => (
            <button
              key={v.id}
              className={`viewtoggle__btn${view === v.id ? ' is-active' : ''}`}
              onClick={() => onView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}
