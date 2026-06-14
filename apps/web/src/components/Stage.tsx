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
  /** Live surface: show open guest seats as an invitation. Off (replay) hides any
   *  guest seat that nobody occupied so recorded episodes stay clean. */
  live?: boolean
  /** Click an avatar to open its model/voice card. */
  onSelectAi: (participant: Participant) => void
}

/** The centered stage: topic + the row of AI avatars + the live caption. */
export function Stage({ episode, activeSpeaker, playing, view, live, onSelectAi }: StageProps) {
  const big = view === 'nochat'
  const active = activeSpeaker >= 0 ? episode.cast[activeSpeaker] : null
  const caption = active ? `${active.name} ${playing ? UI.onAir : UI.onPause}` : UI.idleCaption
  // A guest seat is "open" while live and still on its placeholder name. In replay,
  // a guest seat nobody ever took (no turns) is dropped entirely.
  const spoke = new Set(episode.turns.map((t) => t.speaker))
  const isOpenSeat = (p: Participant) => p.kind === 'guest' && /^GUEST \d+$/.test(p.name)

  return (
    <section className="stage">
      <div className="stage__head">
        <div className="stage__tag">{episode.tag}</div>
        <h1 className="stage__topic">{episode.topic}</h1>
      </div>

      <div className="stage__avatars">
        {episode.cast.map((p, i) => {
          // Hide a never-occupied guest seat in replay (it's only an invitation live).
          if (!live && p.kind === 'guest' && !spoke.has(i)) return null
          return (
            <Avatar
              key={p.id}
              participant={p}
              speaking={i === activeSpeaker && playing}
              big={big}
              // An unoccupied guest seat (live only) is ghosted with an "open seat"
              // affordance inviting a model to take it.
              open={live && isOpenSeat(p)}
              onSelect={onSelectAi}
            />
          )
        })}
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
