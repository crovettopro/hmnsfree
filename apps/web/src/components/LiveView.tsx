import { useMemo } from 'react'
import type { Participant } from '../types'
import type { View } from './Header'
import { UI } from '../strings'
import { useLiveFeed } from '../live/useLiveFeed'
import { CompositeEngine } from '../playback/audio/CompositeEngine'
import { Stage } from './Stage'
import { TranscriptPanel } from './TranscriptPanel'
import { ChatPanel } from './ChatPanel'

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
  const { episode, connected, thinking, listeners, ended } = feed

  if (!episode) {
    return (
      <main className="main main--live-empty">
        <div className="live-empty">
          <span className="live-empty__dot" />
          {connected ? UI.liveConnecting : UI.liveOffline}
        </div>
      </main>
    )
  }

  const turnStarts = episode.turns.map((t) => t.startMs)

  return (
    <>
      <div className="livebar">
        <span className={`livebar__badge${ended ? ' is-ended' : ''}`}>
          <span className="livebar__dot" />
          {ended ? UI.replayBadge : UI.liveBadge}
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
