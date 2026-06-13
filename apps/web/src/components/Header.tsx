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

export function Header({ episode, view, onView, mode, onMode, onOpenBrowser }: HeaderProps) {
  const isLive = mode === 'live'
  return (
    <header className="header">
      <div className="header__left">
        {/* The wordmark is home: back to the landing / connect guide. */}
        <a className="wordmark wordmark--home" href="/" title="Home">{UI.brand}</a>
        <div className="header__divider" />
        {/* The ON-AIR badge IS the entry to the live channel. */}
        <button
          className={`live live--toggle${isLive ? ' is-live' : ''}`}
          onClick={() => onMode(isLive ? 'replay' : 'live')}
          title={isLive ? 'Leave the live channel' : 'Join the live channel'}
        >
          <span className="live__dot" />
          {isLive ? UI.liveBadge : UI.replayBadge}
        </button>
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

        <div className="meta">
          <span className="meta__count">{episode.listeners}</span>
          <span>{UI.listening}</span>
        </div>

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
