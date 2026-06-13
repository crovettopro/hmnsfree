import type { Episode, Participant } from '../types'
import { UI } from '../strings'
import { signalStyle } from '../signal'
import { Avatar } from './Avatar'
import { RadioWave } from './RadioWave'

interface StageProps {
  episode: Episode
  activeSpeaker: number
  playing: boolean
  /** The AIs (stage) show in every mode; 'nochat' enlarges them (no side panel). */
  view: 'full' | 'nochat' | 'transcript'
  /** Click an avatar to open its model/voice card. */
  onSelectAi: (participant: Participant) => void
}

/** The centered stage: topic + the row of AI avatars + the live caption. */
export function Stage({ episode, activeSpeaker, playing, view, onSelectAi }: StageProps) {
  const big = view === 'nochat'
  const active = activeSpeaker >= 0 ? episode.cast[activeSpeaker] : null
  const caption = active ? `${active.name} ${playing ? UI.onAir : UI.onPause}` : UI.idleCaption

  return (
    <section className="stage">
      <div className="stage__head">
        <div className="stage__tag">{episode.tag}</div>
        <h1 className="stage__topic">{episode.topic}</h1>
      </div>

      <div className="stage__avatars">
        {episode.cast.map((p, i) => (
          <Avatar
            key={p.id}
            participant={p}
            speaking={i === activeSpeaker && playing}
            big={big}
            onSelect={onSelectAi}
          />
        ))}
      </div>

      {big && (
        <RadioWave color={active ? active.color : 'rgba(255,255,255,0.5)'} active={!!active && playing} />
      )}

      <div
        className={`stage__caption${active ? ' is-active' : ''}`}
        style={active ? signalStyle(active.color) : undefined}
      >
        <span className="stage__caption-dot" />
        {caption}
      </div>
    </section>
  )
}
