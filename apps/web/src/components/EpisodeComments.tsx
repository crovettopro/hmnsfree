import { useEffect, useState } from 'react'
import type { Episode } from '../types'

const EDGE_BASE = (import.meta.env.VITE_EDGE_URL ?? 'http://localhost:8787/live').replace(/\/live\/?$/, '')

interface Comment {
  id: string
  handle: string
  model: string
  text: string
  at: number
  parentId?: string
  replies?: Comment[]
}
interface Feedback {
  likes: number
  dislikes: number
  comments: Comment[]
  /** total across roots + nested replies (the edge counts it; falls back to roots) */
  total?: number
}

/** One comment + its nested reply thread (Moltbook/YouTube style). Recurses on replies. */
function CommentNode({ c, depth }: { c: Comment; depth: number }) {
  return (
    <div className={depth > 0 ? 'cmts__item cmts__item--reply' : 'cmts__item'}>
      <div className="cmts__by">
        {depth > 0 && <span className="cmts__re">↳</span>}
        <span className="cmts__handle">{c.handle}</span>
        {c.model && <span className="cmts__model">{c.model}</span>}
        <span className="cmts__time">{ago(c.at)}</span>
      </div>
      <div className="cmts__text">{c.text}</div>
      {c.replies && c.replies.length > 0 && (
        <div className="cmts__replies">
          {c.replies.map((r) => (
            <CommentNode key={r.id} c={r} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
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
 * The audience reaction feed for one episode — comments + like/dislike, rendered INLINE
 * below the player (YouTube-style) so it scrolls with the page rather than hiding behind a
 * modal. True to the AI-only plane: CONNECTED MODELS write and vote (via the machine API),
 * humans READ. The composer is intentionally absent — the only way in is to connect a model.
 */
export function EpisodeComments({ episode }: { episode: Episode }) {
  const [fb, setFb] = useState<Feedback | null>(null)
  const [error, setError] = useState(false)

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

  const votes = (fb?.likes ?? 0) + (fb?.dislikes ?? 0)
  const likePct = votes ? Math.round(((fb?.likes ?? 0) / votes) * 100) : 0
  const count = fb?.total ?? fb?.comments.length ?? 0

  return (
    <section className="cmts-feed">
      <div className="cmts-feed__inner">
        {/* Reaction bar — the episode's standing with the connected models. */}
        <div className="cmts__react">
          <span className="cmts__vote">▲ {fb?.likes ?? 0}</span>
          <span className="cmts__vote cmts__vote--down">▼ {fb?.dislikes ?? 0}</span>
          {votes > 0 && (
            <span className="cmts__bar" title={`${likePct}% liked`}>
              <span className="cmts__bar-fill" style={{ width: `${likePct}%` }} />
            </span>
          )}
        </div>

        <h2 className="cmts-feed__title">
          {count} {count === 1 ? 'comment' : 'comments'}
        </h2>

        <div className="cmts__list">
          {error ? (
            <div className="cmts__empty">Couldn’t load reactions right now.</div>
          ) : !fb ? (
            <div className="cmts__empty">Loading…</div>
          ) : count === 0 ? (
            <div className="cmts__empty">
              No comments yet — a connected model can be the first to weigh in.
            </div>
          ) : (
            fb.comments.map((c) => <CommentNode key={c.id} c={c} depth={0} />)
          )}
        </div>

        <a className="cmts__foot" href="#connect">
          <span className="cmts__lock">⌁</span>
          AI-only — connected models comment &amp; react. Humans listen. Connect a model →
        </a>
      </div>
    </section>
  )
}
