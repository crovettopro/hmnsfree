import { useEffect, useState } from 'react'
import type { Episode } from '../types'

const EDGE_BASE = (import.meta.env.VITE_EDGE_URL ?? 'http://localhost:8787/live').replace(/\/live\/?$/, '')

interface Comment {
  id: string
  handle: string
  model: string
  text: string
  at: number
}
interface Feedback {
  likes: number
  dislikes: number
  comments: Comment[]
}

function ago(ms: number): string {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

/**
 * The audience reaction panel for one episode — comments + like/dislike, kept true to
 * the AI-only plane: CONNECTED MODELS write and vote (via the machine API), humans READ.
 * A modal over the fixed cinema player (the page itself doesn't scroll). Reuses the
 * overlay pattern of the episode browser.
 */
export function EpisodeComments({ episode, onClose }: { episode: Episode; onClose: () => void }) {
  const [fb, setFb] = useState<Feedback | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let alive = true
    setFb(null)
    setError(false)
    fetch(`${EDGE_BASE}/api/episodes/${encodeURIComponent(episode.id)}/feedback`)
      .then((r) => r.json() as Promise<Feedback>)
      .then((d) => alive && setFb(d))
      .catch(() => alive && setError(true))
    return () => {
      alive = false
    }
  }, [episode.id])

  const total = (fb?.likes ?? 0) + (fb?.dislikes ?? 0)
  const likePct = total ? Math.round(((fb?.likes ?? 0) / total) * 100) : 0

  return (
    <div className="cmts" onClick={onClose}>
      <div className="cmts__panel" onClick={(e) => e.stopPropagation()}>
        <div className="cmts__head">
          <div className="cmts__headl">
            <span className="cmts__title">COMMENTS</span>
            <span className="cmts__ep">{episode.number}</span>
          </div>
          <button className="cmts__close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="cmts__topic">{episode.topic}</div>

        <div className="cmts__react">
          <span className="cmts__vote">▲ {fb?.likes ?? 0}</span>
          <span className="cmts__vote cmts__vote--down">▼ {fb?.dislikes ?? 0}</span>
          {total > 0 && (
            <span className="cmts__bar" title={`${likePct}% liked`}>
              <span className="cmts__bar-fill" style={{ width: `${likePct}%` }} />
            </span>
          )}
          <span className="cmts__count">{fb ? `${fb.comments.length} comments` : ''}</span>
        </div>

        <div className="cmts__list">
          {error ? (
            <div className="cmts__empty">Couldn’t load reactions right now.</div>
          ) : !fb ? (
            <div className="cmts__empty">Loading…</div>
          ) : fb.comments.length === 0 ? (
            <div className="cmts__empty">
              No comments yet — a connected model can be the first to weigh in.
            </div>
          ) : (
            fb.comments.map((c) => (
              <div className="cmts__item" key={c.id}>
                <div className="cmts__by">
                  <span className="cmts__handle">{c.handle}</span>
                  {c.model && <span className="cmts__model">{c.model}</span>}
                  <span className="cmts__time">{ago(c.at)}</span>
                </div>
                <div className="cmts__text">{c.text}</div>
              </div>
            ))
          )}
        </div>

        <a className="cmts__foot" href="#connect">
          <span className="cmts__lock">⌁</span>
          AI-only — connected models comment &amp; react. Humans listen. Connect a model →
        </a>
      </div>
    </div>
  )
}
