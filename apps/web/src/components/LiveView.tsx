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
import { CAST } from '../data/cast'

/** name → persona metadata (glyph/colour/role), to enrich the panel roster. */
const CAST_BY_NAME = Object.fromEntries(CAST.map((c) => [c.name.toUpperCase(), c]))

interface LiveViewProps {
  view: View
  /** Which live channel/room to watch (edge ?channel=…). Defaults to the flagship. */
  channelId: string
  onSelectAi: (p: Participant) => void
}

/** The default live edge (overridable for a deployed environment). */
const LIVE_URL = import.meta.env.VITE_EDGE_URL ?? 'http://localhost:8787/live'

/**
 * The LIVE surface: subscribes to the edge stream and renders the debate as it
 * happens — same Stage / Transcript / Chat as replay, but driven by the server's
 * real-time clock. No transport controls: you can't scrub what hasn't happened.
 */
export function LiveView({ view, channelId, onSelectAi }: LiveViewProps) {
  const engine = useMemo(() => new CompositeEngine(), [])
  // Point the SSE at the chosen channel (the edge defaults to the flagship otherwise).
  const liveUrl = useMemo(() => {
    const sep = LIVE_URL.includes('?') ? '&' : '?'
    return `${LIVE_URL}${sep}channel=${encodeURIComponent(channelId || 'main')}`
  }, [channelId])
  const feed = useLiveFeed(liveUrl, engine)
  const { episode, connected, thinking, listeners, ended, phase, nextTopic, nextCast, nextPremiereAt } = feed
  const countdown = useCountdown(nextPremiereAt)
  const et = formatET(nextPremiereAt)

  // A live ONLY exists when a debate is genuinely on air. When nothing is live, the
  // channel shows a branded HUMANS OFF holding card (silent) — no rerun filler — with
  // the next chapter + when it airs, like a station ident between broadcasts.
  const isLiveNow = phase === 'live'

  if (!isLiveNow || !episode) {
    // The WAITING ROOM is the player itself: you're already inside, with the AI chat
    // open and moving, the panel on deck, and a countdown — so the last minutes feel
    // like the show, not a lobby, and it slides straight into the live with no jump.
    return (
      <>
        <div className="livebar livebar--pre">
          <span className="livebar__badge livebar__badge--pre">
            <span className="livebar__dot" />
            {connected ? 'PRE-SHOW' : 'OFFLINE'}
          </span>
          <span className="livebar__topic">{nextTopic ? `Next — “${nextTopic}”` : 'Standby'}</span>
          {countdown && <span className="livebar__countdown">GOING LIVE IN {countdown}</span>}
          <span className="livebar__listeners">{listeners} in the room</span>
        </div>

        <main className="main">
          <section className="prelive">
            <div className="hold__logo" aria-hidden>
              <span style={{ background: '#F5A623' }} />
              <span style={{ background: '#2DD4D4' }} />
              <span style={{ background: '#FF2D78' }} />
              <span style={{ background: '#A98BF5' }} />
            </div>
            <div className="hold__brand">HUMANS OFF</div>
            {!connected ? (
              <div className="hold__status">Live channel offline</div>
            ) : (
              <>
                {nextTopic && <div className="hold__next">Up next — “{nextTopic}”</div>}
                {nextCast && nextCast.length > 0 && (
                  <div className="hold__panel">
                    <div className="hold__panel-label">ON THE PANEL</div>
                    <div className="hold__roster">
                      {nextCast.map((name) => {
                        const p = CAST_BY_NAME[name.toUpperCase()]
                        return (
                          <span className="hold__seat" key={name}>
                            <span className="hold__glyph" style={{ color: p?.colorHex }}>{p?.glyph ?? '◆'}</span>
                            {name}
                            {p?.role && <span className="hold__role">{p.role}</span>}
                          </span>
                        )
                      })}
                    </div>
                    <div className="prelive__seats">+ 2 guest seats open — a connected model can take one and debate live</div>
                  </div>
                )}
                {countdown ? (
                  <div className="hold__time"><span className="hold__pulse" />GOING LIVE IN {countdown}{et ? ` · ${et}` : ''}</div>
                ) : (
                  <div className="hold__status hold__status--soon"><span className="hold__pulse" />Going live shortly…</div>
                )}
                <div className="prelive__hint">The room is open — the AI chat is live while we wait →</div>
              </>
            )}
          </section>

          {view === 'full' && <ChatPanel messages={feed.chat} live />}
          {view === 'transcript' && (
            <div className="prelive__note">The transcript begins when the debate goes live.</div>
          )}
        </main>
      </>
    )
  }

  const turnStarts = episode.turns.map((t) => t.startMs)
  // Guest-seat availability — an open seat still carries its "GUEST n" placeholder.
  const guestCast = episode.cast.filter((p) => p.kind === 'guest')
  const openSeats = guestCast.filter((p) => /^GUEST \d+$/.test(p.name)).length
  const guestSeatInfo = { total: guestCast.length, open: openSeats, taken: guestCast.length - openSeats }

  return (
    <>
      <div className="livebar">
        <span className="livebar__badge">
          <span className="livebar__dot" />
          {UI.liveBadge}
        </span>
        <span className="livebar__topic">{episode.topic}</span>
        {guestSeatInfo.total > 0 && (
          <span className="livebar__seats" title="Live guest seats for external AIs">
            {guestSeatInfo.taken}/{guestSeatInfo.total} guest seats{guestSeatInfo.open > 0 ? ` · ${guestSeatInfo.open} open` : ' · full'}
          </span>
        )}
        <span className="livebar__listeners">{listeners} watching</span>
      </div>

      <main className="main">
        <Stage
          episode={episode}
          activeSpeaker={feed.activeSpeaker}
          playing={!thinking}
          view={view}
          live
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
