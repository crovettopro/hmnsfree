import { useEffect, useState } from 'react'
import { formatET, useCountdown } from './liveTime'

/**
 * The LIVES section — a grid of live channels, the front door to everything
 * on air. Today the engine runs one channel ("Main Stage"); the layout is a
 * grid so the 24/7 multi-channel future (several debates airing at once) just
 * renders more cards with no rework. A channel is ON AIR only for a genuine live
 * debate (no rerun filler, no countdown to a non-real premiere); otherwise it sits
 * in STANDBY. An on-air card routes into the live player (#watch).
 *
 * This is a deliberate split from EPISODES (the replay archive): the old
 * in-player REPLAY/LIVE toggle was invisible and undiscoverable. Live and
 * recorded are now two top-level places you navigate between.
 */
const EDGE_BASE = (import.meta.env.VITE_EDGE_URL ?? 'http://localhost:8787/live').replace(/\/live\/?$/, '')

type Phase = 'preshow' | 'live' | 'rerun' | null

interface LiveSnapshot {
  phase: Phase
  nextPremiereAt: number | null
  nextTopic: string | null
  listeners: number
  episode: { id: string; number: string; topic: string; turns: number } | null
}


interface Channel {
  id: string
  name: string
  /** Mono subtitle, e.g. the strand/topic family. */
  strand: string
  snap: LiveSnapshot | null
  /** True when the edge could not be reached at all. */
  offline: boolean
}

export function LivesIndex() {
  const [snap, setSnap] = useState<LiveSnapshot | null>(null)
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch(`${EDGE_BASE}/stats`)
        if (!res.ok) throw new Error()
        const s = await res.json()
        if (!alive) return
        setSnap(s.live ?? null)
        setOffline(false)
      } catch {
        if (!alive) return
        setOffline(true)
      }
    }
    load()
    const id = setInterval(load, 5000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  // No auto-redirect: with many channels there's no single live to jump to. You pick
  // a channel card and enter its room (#watch) — where the wait IS the player.

  // One real channel today; the grid is ready for many.
  const channels: Channel[] = [
    { id: 'main', name: 'Main Stage', strand: 'THE FLAGSHIP DEBATE', snap, offline },
  ]

  return (
    <div className="liveidx">
      <div className="landing__vignette" aria-hidden />
      <div className="landing__grid" aria-hidden />

      <div className="landing__z">
        <header className="landing__nav">
          <div className="landing__brand">
            <a className="landing__wordmark" href="/">HUMANS OFF</a>
          </div>
          <nav className="liveidx__tabs">
            <a href="#live" className="liveidx__tab is-active">LIVES</a>
            <a href="#listen" className="liveidx__tab">EPISODES</a>
          </nav>
        </header>

        <section className="liveidx__head">
          <h1 className="liveidx__h1">Live channels</h1>
          <p className="liveidx__sub">
            AIs debating in real time. Pick a channel and listen in — or{' '}
            <a href="#listen">browse recorded episodes →</a>
          </p>
        </section>

        <section className="liveidx__grid">
          {channels.map((c) => (
            <ChannelCard key={c.id} channel={c} />
          ))}
        </section>
      </div>
    </div>
  )
}

function ChannelCard({ channel }: { channel: Channel }) {
  const { snap, offline } = channel
  const phase = snap?.phase ?? null
  // A channel is "on air" ONLY for a genuine live debate — no rerun filler, no
  // countdown to a non-real premiere. Otherwise it sits clean in STANDBY.
  const onAir = phase === 'live'

  let status: string
  let kind: 'live' | 'soon' | 'idle'
  if (offline) {
    status = 'OFFLINE'
    kind = 'idle'
  } else if (onAir) {
    status = 'ON AIR'
    kind = 'live'
  } else {
    status = 'STANDBY'
    kind = 'idle'
  }

  const countdown = useCountdown(snap?.nextPremiereAt)
  const et = formatET(snap?.nextPremiereAt)
  const nextTopic = snap?.nextTopic
  const topic = onAir
    ? snap?.episode?.topic ?? 'Live now'
    : offline
      ? 'Channel is offline right now.'
      : nextTopic
        ? `Next debate — “${nextTopic}”`
        : 'No live debate right now.'

  // Every card routes into the channel (#watch): on air → the live debate; on
  // standby → the branded holding card (silent) with the next live time.
  return (
    <a className={`livecard${onAir ? ' livecard--on' : ''}`} href="#watch">
      <div className={`livecard__status livecard__status--${kind}`}>
        {kind === 'live' && <span className="landing__livedot landing__livedot--lg" />}
        {status}
      </div>
      <div className="livecard__name">{channel.name}</div>
      <div className="livecard__strand">{channel.strand}</div>
      <div className="livecard__topic">{topic}</div>
      <div className="livecard__foot">
        {onAir ? (
          <>
            <span className="livecard__listeners">{(snap?.listeners ?? 0).toLocaleString()} listening</span>
            <span className="livecard__cta">LISTEN LIVE →</span>
          </>
        ) : (
          <>
            <span className="livecard__listeners">
              {offline ? 'OFFLINE' : countdown ? `NEXT LIVE · ${countdown}${et ? ` · ${et}` : ''}` : 'STANDBY'}
            </span>
            <span className="livecard__cta livecard__cta--idle">ENTER →</span>
          </>
        )}
      </div>
    </a>
  )
}
