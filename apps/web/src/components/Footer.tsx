import { useMemo } from 'react'
import type { Episode } from '../types'
import { signalStyle } from '../signal'
import { fmtTime, fmtRate } from '../playback/usePlayer'

interface FooterProps {
  episode: Episode
  elapsed: number
  total: number
  progress: number
  playing: boolean
  rate: number
  activeSpeaker: number
  onSeekFraction: (frac: number) => void
  onToggle: () => void
  onStepBack: () => void
  onStepForward: () => void
  onCycleRate: () => void
}

const BAR_COUNT = 48

// Deterministic bar heights — a fixed pseudo-waveform shape (matches the spec).
const BAR_HEIGHTS = Array.from(
  { length: BAR_COUNT },
  (_, i) => 18 + 64 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6)),
)

export function Footer({
  episode,
  elapsed,
  total,
  progress,
  playing,
  rate,
  activeSpeaker,
  onSeekFraction,
  onToggle,
  onStepBack,
  onStepForward,
  onCycleRate,
}: FooterProps) {
  const activeColor =
    activeSpeaker >= 0 ? episode.cast[activeSpeaker].color : 'rgba(255,255,255,0.8)'

  const bars = useMemo(() => {
    return BAR_HEIGHTS.map((h, i) => {
      const pos = i / BAR_COUNT
      const played = pos <= progress
      const isHead = played && (i + 1) / BAR_COUNT > progress
      return { h, played, isHead }
    })
  }, [progress])

  const onSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    onSeekFraction((e.clientX - r.left) / r.width)
  }

  return (
    <footer className="footer">
      {/* Row 1 — scrubber */}
      <div className="scrubber">
        <span className="scrubber__time scrubber__time--cur">{fmtTime(elapsed)}</span>
        <div className="scrubber__track" onClick={onSeek} style={signalStyle(activeColor)}>
          {bars.map((b, i) => (
            <span
              key={i}
              className={`scrubber__bar${b.isHead ? ' is-head' : b.played ? ' is-played' : ''}`}
              style={{ height: `${b.h}%` }}
            />
          ))}
        </div>
        <span className="scrubber__time scrubber__time--tot">{fmtTime(total)}</span>
      </div>

      {/* Row 2 — transport + legend */}
      <div className="transport">
        <div className="transport__left">
          <button className="btn-step" onClick={onStepBack} title="Previous turn" aria-label="Previous turn">
            ⏮
          </button>
          <button className="btn-play" onClick={onToggle} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? (
              <span className="btn-play__pause">
                <span />
                <span />
              </span>
            ) : (
              <span className="btn-play__play" />
            )}
          </button>
          <button className="btn-step" onClick={onStepForward} title="Next turn" aria-label="Next turn">
            ⏭
          </button>
          <button className="btn-rate" onClick={onCycleRate} title="Playback speed">
            {fmtRate(rate)}
          </button>
        </div>

        <div className="legend">
          {episode.cast.map((p, i) => {
            const on = i === activeSpeaker && playing
            return (
              <div
                key={p.id}
                className={`legend__chip${on ? ' is-active' : ''}`}
                style={signalStyle(p.color)}
              >
                <span className="legend__glyph">{p.glyph}</span>
                <span className="legend__name">{p.name}</span>
              </div>
            )
          })}
        </div>
      </div>
    </footer>
  )
}
