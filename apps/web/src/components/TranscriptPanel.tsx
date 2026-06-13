import { useEffect, useRef } from 'react'
import type { Episode, Turn } from '../types'
import { UI } from '../strings'
import { signalStyle } from '../signal'
import { fmtTime } from '../playback/usePlayer'

interface TranscriptPanelProps {
  episode: Episode
  turnStarts: number[]
  cursor: number
  started: boolean
  playing: boolean
  activeSpeaker: number
  /** Current playback position, ms — drives the word-by-word reveal. */
  elapsed: number
  /** Jump the player to a turn's start when its line is clicked. */
  onSeek: (ms: number) => void
}

/**
 * How much of a turn's text has been "spoken" by `localMs` into it. Uses word
 * timings when present (produced episodes), else reveals proportionally by time.
 * This is what makes the transcript build up WHILE the AI talks instead of
 * dumping the full line before it speaks.
 */
function revealedText(turn: Turn, localMs: number): string {
  const words = turn.text.split(/\s+/).filter(Boolean)
  if (localMs >= turn.durationMs) return turn.text
  let count: number
  const wt = turn.audio?.wordTimings
  if (wt && wt.length) {
    count = wt.filter((w) => w.startMs <= localMs).length
  } else {
    const frac = Math.max(0, Math.min(1, turn.durationMs ? localMs / turn.durationMs : 1))
    count = Math.ceil(words.length * frac)
  }
  return words.slice(0, Math.max(0, count)).join(' ')
}

/** The streaming "live transcript": one row per spoken-so-far turn. */
export function TranscriptPanel({
  episode,
  turnStarts,
  cursor,
  started,
  playing,
  activeSpeaker,
  elapsed,
  onSeek,
}: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const visibleCount = started ? cursor + 1 : 0

  // Auto-scroll to the bottom as the active line grows (no scrollIntoView).
  const active = activeSpeaker >= 0 ? episode.cast[activeSpeaker] : null
  const activeTurn = started ? episode.turns[cursor] : undefined
  const localMs = activeTurn ? elapsed - activeTurn.startMs : 0
  const revealed = activeTurn ? revealedText(activeTurn, localMs) : ''

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [visibleCount, revealed, playing])

  const showTyping = playing && active && revealed.length < (activeTurn?.text.length ?? 0)

  return (
    <aside className="transcript">
      <div className="transcript__head">
        <span className="transcript__title">{UI.transcriptTitle}</span>
        <span className="transcript__count">
          {visibleCount} / {episode.turns.length}
        </span>
      </div>

      <div className="transcript__scroll" ref={scrollRef}>
        {episode.turns.slice(0, visibleCount).map((turn, idx) => {
          const speaker = episode.cast[turn.speaker]
          const isLast = idx === cursor
          // Past turns show in full; the active turn builds up as it's spoken.
          const body = isLast ? revealed : turn.text
          return (
            <button
              key={idx}
              type="button"
              className={`row${isLast ? ' is-active' : ''}`}
              style={signalStyle(speaker.color)}
              onClick={() => onSeek(turnStarts[idx])}
              title={UI.jumpToLine}
            >
              <div className="row__head">
                <span className="row__name">{speaker.name}</span>
                <span className="row__stamp">{fmtTime(turnStarts[idx])}</span>
              </div>
              <p className="row__text">
                {body}
                {isLast && playing && body.length < turn.text.length && (
                  <span className="row__caret" />
                )}
              </p>
            </button>
          )
        })}

        {showTyping && active && (
          <div className="typing" style={signalStyle(active.color)}>
            <span className="typing__name">{UI.speaking.replace('{name}', active.name)}</span>
            <span className="typing__dots">
              <span className="typing__dot" />
              <span className="typing__dot" />
              <span className="typing__dot" />
            </span>
          </div>
        )}
      </div>
    </aside>
  )
}
