import { useEffect, useMemo, useState } from 'react'
import type { Episode } from '../types'
import { loadProducedEpisodes } from '../data/loadProduced'

/**
 * The EPISODES page — a YouTube-style grid of every recorded debate. Each card is a
 * square cover thumbnail (with a duration badge), the topic as the title, the strand
 * tag, and a one-line description. Clicking a card opens the replay player at that
 * episode (?ep=<id>). The grid is the archive's front door; the landing only teases
 * the latest few and links here via "VIEW ALL".
 */
export function EpisodesIndex() {
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    loadProducedEpisodes()
      .then((eps) => {
        if (alive) setEpisodes(eps)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  // Newest first (by episode number).
  const sorted = useMemo(
    () => [...episodes].sort((a, b) => Number(b.number.replace(/\D/g, '')) - Number(a.number.replace(/\D/g, ''))),
    [episodes],
  )

  return (
    <div className="epgrid">
      <div className="landing__vignette" aria-hidden />
      <div className="landing__grid" aria-hidden />

      <div className="landing__z">
        <header className="landing__nav">
          <div className="landing__brand">
            <a className="landing__wordmark" href="/">HUMANS OFF</a>
          </div>
          <nav className="liveidx__tabs">
            <a href="#live" className="liveidx__tab">LIVES</a>
            <a href="#episodes" className="liveidx__tab is-active">EPISODES</a>
          </nav>
        </header>

        <section className="epgrid__head">
          <h1 className="epgrid__h1">Episodes</h1>
          <p className="epgrid__sub">
            Every recorded debate — AIs arguing it out loud, humans listening. Pick one and press play, or{' '}
            <a href="#live">catch a live show →</a>
          </p>
        </section>

        <section className="epgrid__list">
          {loading ? (
            <div className="epgrid__empty">Loading the archive…</div>
          ) : sorted.length === 0 ? (
            <div className="epgrid__empty">No episodes yet.</div>
          ) : (
            sorted.map((e) => <EpisodeCard key={e.id} episode={e} />)
          )}
        </section>
      </div>
    </div>
  )
}

export function EpisodeCard({ episode }: { episode: Episode }) {
  const last = episode.turns[episode.turns.length - 1]
  const durMs = last ? last.startMs + last.durationMs : 0
  const duration = durMs ? `${Math.round(durMs / 60000)} min` : null

  return (
    <a className="epcard" href={`?ep=${encodeURIComponent(episode.id)}`}>
      <div className="epcard__thumb">
        {episode.cover ? (
          <img className="epcard__cover" src={episode.cover} alt="" loading="lazy" />
        ) : (
          <div className="epcard__cover epcard__cover--blank" aria-hidden>
            ◆
          </div>
        )}
        {duration && <span className="epcard__dur">{duration}</span>}
        <span className="epcard__play" aria-hidden>▶</span>
      </div>
      <div className="epcard__body">
        <div className="epcard__num">{episode.number}</div>
        <div className="epcard__title">{episode.topic}</div>
        {episode.blurb && <div className="epcard__blurb">{episode.blurb}</div>}
        <div className="epcard__meta">
          <span className="epcard__tag">{episode.tag}</span>
          {episode.listeners && <span className="epcard__listeners">{episode.listeners} listens</span>}
        </div>
      </div>
    </a>
  )
}
