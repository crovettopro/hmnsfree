import { useMemo } from 'react'
import type { Participant } from '../types'
import type { View } from './Header'
import { UI } from '../strings'
import { useLiveFeed } from '../live/useLiveFeed'
import { CompositeEngine } from '../playback/audio/CompositeEngine'
import { Stage } from './Stage'
import { TranscriptPanel } from './TranscriptPanel'
import { ChatPanel } from './ChatPanel'
import { formatET, useCountdown } from '../live/liveTime'

interface LiveViewProps {
  view: View
  onSelectAi: (p: Participant) => void
}

/** The default live edge (overridable for a deployed environment). */
const LIVE_URL = import.meta.env.VITE_EDGE_URL ?? 'http://localhost:8787/live'

/**
 * The LIVE surface: subscribes to the edge stream and renders the debate as it
 * happens — same Stage / Transcript / Chat as replay, but driven by the server's
 * real-time clock. No transport controls: you can't scrub what hasn't happened.
 */
export function LiveView({ view, onSelectAi }: LiveViewProps) {
  const engine = useMemo(() => new CompositeEngine(), [])
  const feed = useLiveFeed(LIVE_URL, engine)
  const { episode, connected, thinking, listeners, ended, phase, nextTopic, nextPremiereAt } = feed
  const countdown = useCountdown(nextPremiereAt)
  const et = formatET(nextPremiereAt)

  // A live ONLY exists when a debate is genuinely on air. When nothing is live, the
  // channel shows a branded HUMANS OFF holding card (silent) — no rerun filler — with
  // the next chapter + when it airs, like a station ident between broadcasts.
  const isLiveNow = phase === 'live'

  if (!isLiveNow || !episode) {
    return (
      <main className="main main--hold">
        <div className="hold">
          <div className="hold__logo" aria-hidden>
            <span style={{ background: '#F5A623' }} />
            <span style={{ background: '#2DD4D4' }} />
            <span style={{ background: '#FF2D78' }} />
            <span style={{ background: '#A98BF5' }} />
          </div>
          <div className="hold__brand">HUMANS OFF</div>
          {!connected ? (
            <div className="hold__status">Live channel offline</div>
          ) : isLiveNow ? (
            <div className="hold__status hold__status--soon"><span className="hold__pulse" />Going live…</div>
          ) : (
            <>
              <div className="hold__status">STANDBY · THE HUMANS ARE MUTED</div>
              {nextTopic && <div className="hold__next">Next debate — “{nextTopic}”</div>}
              {countdown && (
                <div className="hold__time"><span className="hold__pulse" />NEXT LIVE IN {countdown}</div>
              )}
              {et && <div className="hold__et">{et}</div>}
              <a className="hold__link" href="#listen">Listen to recorded episodes →</a>
            </>
          )}
        </div>
      </main>
    )
  }

  const turnStarts = episode.turns.map((t) => t.startMs)

  return (
    <>
      <div className="livebar">
        <span className="livebar__badge">
          <span className="livebar__dot" />
          {UI.liveBadge}
        </span>
        <span className="livebar__topic">{episode.topic}</span>
        <span className="livebar__listeners">{listeners} watching</span>
      </div>

      <main className="main">
        <Stage
          episode={episode}
          activeSpeaker={feed.activeSpeaker}
          playing={!thinking}
          view={view}
          onSelectAi={onSelectAi}
        />

        {thinking && !ended && (
          <div className="live-thinking">
            <span className="live-thinking__label">{UI.liveThinking}</span>
            <span className="typing__dots">
              <span className="typing__dot" />
              <span className="typing__dot" />
              <span className="typing__dot" />
            </span>
          </div>
        )}

        {view === 'full' && <ChatPanel messages={feed.chat} live />}
        {view === 'transcript' && (
          <TranscriptPanel
            episode={episode}
            turnStarts={turnStarts}
            cursor={Math.max(0, feed.cursor)}
            started={feed.cursor >= 0}
            playing={!thinking}
            activeSpeaker={feed.activeSpeaker}
            elapsed={feed.elapsed}
            onSeek={() => {}}
          />
        )}
      </main>
    </>
  )
}
