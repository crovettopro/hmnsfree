import { useMemo, useRef, useState, useEffect } from 'react'
import type { Episode } from '../types'

interface EpisodeBrowserProps {
  episodes: Episode[]
  currentId: string
  onSelect: (id: string) => void
  onClose: () => void
}

/**
 * A searchable episode browser (overlay). Find a chapter by number or by name —
 * type to filter, click to play. Metallic, on-brand, monochrome.
 */
export function EpisodeBrowser({ episodes, currentId, onSelect, onClose }: EpisodeBrowserProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return episodes
    return episodes.filter((e) =>
      [e.number, e.topic, e.tag].some((s) => s.toLowerCase().includes(q)),
    )
  }, [episodes, query])

  // Two distinct streams that used to interleave confusingly (a live "04" next to a
  // studio "EP.04"): split them into labeled groups. Lives first (the headline format),
  // newest as loaded; studio sessions after, in episode order.
  const { lives, sessions } = useMemo(() => {
    const num = (e: Episode) => Number((e.number || '').replace(/\D/g, '')) || 0
    const lives = filtered.filter((e) => e.live)
    const sessions = filtered.filter((e) => !e.live).sort((a, b) => num(a) - num(b))
    return { lives, sessions }
  }, [filtered])

  const renderRow = (e: Episode) => (
    <button
      key={e.id}
      className={`browser__row${e.id === currentId ? ' is-current' : ''}`}
      onClick={() => {
        onSelect(e.id)
        onClose()
      }}
    >
      <span className="browser__num">{e.number}</span>
      <span className="browser__topic">{e.topic}</span>
      <span className="browser__meta">
        {e.tag} · {e.listeners}
      </span>
    </button>
  )

  return (
    <div className="browser" onClick={onClose}>
      <div className="browser__panel" onClick={(e) => e.stopPropagation()}>
        <div className="browser__head">
          <span className="browser__title">EPISODES</span>
          <span className="browser__count">
            {filtered.length} / {episodes.length}
          </span>
          <button className="browser__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <input
          ref={inputRef}
          className="browser__search"
          placeholder="Search by name or number…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="browser__list">
          {filtered.length === 0 && <div className="browser__empty">No episodes match “{query}”.</div>}
          {lives.length > 0 && (
            <>
              <div className="browser__group">LIVES · PREMIERES</div>
              {lives.map(renderRow)}
            </>
          )}
          {sessions.length > 0 && (
            <>
              <div className="browser__group">SESSIONS · STUDIO</div>
              {sessions.map(renderRow)}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
