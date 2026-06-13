import { useEffect, useMemo } from 'react'
import type { Episode, Participant } from '../types'
import { AI_PROFILES } from '../data/profiles'
import { UI } from '../strings'
import { signalStyle } from '../signal'
import { fmtTime } from '../playback/usePlayer'

interface AiInfoCardProps {
  participant: Participant
  /** The episode in view — drives this AI's "in this episode" stats. */
  episode: Episode
  onClose: () => void
}

/** This AI's footprint in the current episode: turns, airtime, share of voice. */
function episodeStats(episode: Episode, participantId: string) {
  const idx = episode.cast.findIndex((c) => c.id === participantId)
  if (idx < 0) return null
  let turns = 0
  let speakingMs = 0
  let words = 0
  let totalMs = 0
  for (const t of episode.turns) {
    totalMs += t.durationMs
    if (t.speaker === idx) {
      turns++
      speakingMs += t.durationMs
      words += t.text.split(/\s+/).filter(Boolean).length
    }
  }
  if (!turns) return null
  return { turns, speakingMs, words, share: totalMs ? speakingMs / totalMs : 0 }
}

/**
 * "What's under the hood" card for one AI: its glyph/role, the model that
 * generates its turns and the voice that speaks it, plus its footprint in the
 * current episode (turns, airtime, share of voice). Click an avatar to open it.
 * Helps the audience understand each voice is a real (swappable) model — and
 * previews the future "bring your own model" plane.
 */
export function AiInfoCard({ participant, episode, onClose }: AiInfoCardProps) {
  const p = AI_PROFILES[participant.id]
  const stats = useMemo(() => episodeStats(episode, participant.id), [episode, participant.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="aicard" onClick={onClose}>
      <div
        className="aicard__panel"
        style={signalStyle(participant.color)}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="aicard__close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <div className="aicard__head">
          <span className="aicard__glyph">{participant.glyph}</span>
          <div>
            <div className="aicard__name">{participant.name}</div>
            <div className="aicard__role">{participant.role}</div>
          </div>
        </div>

        {p && <p className="aicard__blurb">{p.blurb}</p>}

        {p && (
          <dl className="aicard__specs">
            <div className="aicard__spec">
              <dt>{UI.aicard.model}</dt>
              <dd>{p.model}</dd>
            </div>
            <div className="aicard__spec">
              <dt>{UI.aicard.provider}</dt>
              <dd>{p.modelProvider}</dd>
            </div>
            <div className="aicard__spec">
              <dt>{UI.aicard.temp}</dt>
              <dd>{p.temperature.toFixed(2)}</dd>
            </div>
            <div className="aicard__spec">
              <dt>{UI.aicard.voice}</dt>
              <dd>{p.voiceKind}</dd>
            </div>
          </dl>
        )}

        {stats && (
          <div className="aicard__episode">
            <div className="aicard__episode-head">
              <span>{UI.aicard.inEpisode}</span>
              <span className="aicard__episode-ep">{episode.number}</span>
            </div>
            <div className="aicard__share">
              <div
                className="aicard__share-fill"
                style={{ width: `${Math.round(stats.share * 100)}%` }}
              />
            </div>
            <div className="aicard__episode-stats">
              <span>
                <b>{Math.round(stats.share * 100)}%</b> {UI.aicard.share}
              </span>
              <span>
                <b>{stats.turns}</b> {UI.aicard.turns}
              </span>
              <span>
                <b>{fmtTime(stats.speakingMs)}</b> {UI.aicard.airtime}
              </span>
            </div>
          </div>
        )}

        <div className="aicard__foot">{UI.aicard.byo}</div>
      </div>
    </div>
  )
}
