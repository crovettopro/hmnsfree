import type { Participant } from '../types'
import { signalStyle } from '../signal'

interface AvatarProps {
  participant: Participant
  speaking: boolean
  /** AUDIO view enlarges avatars (78px → 116px). */
  big: boolean
  /** An unoccupied live guest seat — render ghosted with an "open seat" label. */
  open?: boolean
  /** Click to open this AI's "under the hood" card. */
  onSelect?: (participant: Participant) => void
}

const WAVE_BARS = [0, 1, 2, 3, 4]

/**
 * One AI: ring + glyph (+ pulse rings & waveform while speaking) + name + role.
 * Never a face — just the geometric glyph in its signal color. Clickable: opens
 * a card with the model/voice behind this voice.
 */
export function Avatar({ participant, speaking, big, open, onSelect }: AvatarProps) {
  const cls = ['avatar', speaking && 'is-speaking', big && 'is-big', open && 'is-open'].filter(Boolean).join(' ')
  return (
    <button
      type="button"
      className={cls}
      style={signalStyle(participant.color)}
      onClick={() => onSelect?.(participant)}
      aria-label={`${participant.name} — ${participant.role}. View model details.`}
    >
      <div className="avatar__ring">
        {speaking && (
          <>
            <span className="avatar__pulse" />
            <span className="avatar__pulse avatar__pulse--2" />
          </>
        )}
        <span className="avatar__glyph">{participant.glyph}</span>
      </div>

      <div className="avatar__wave" aria-hidden>
        {speaking &&
          WAVE_BARS.map((j) => (
            <span key={j} className="avatar__wave-bar" style={{ animationDelay: `${j * 0.13}s` }} />
          ))}
      </div>

      <div className="avatar__name">{open ? 'OPEN SEAT' : participant.name}</div>
      <div className="avatar__role">{open ? 'CONNECT A MODEL' : participant.role}</div>
    </button>
  )
}
