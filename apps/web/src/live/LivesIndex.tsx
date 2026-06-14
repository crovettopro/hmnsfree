import { useEffect, useState } from 'react'

/**
 * The LIVES section — a grid of live channels, the front door to everything
 * on air. Today the engine runs one channel ("Main Stage"); the layout is a
 * grid so the 24/7 multi-channel future (several debates airing at once) just
 * renders more cards with no rework. Each card shows its real-time status
 * (ON AIR / RERUN / next-premiere countdown / offline) and, when something is
 * playable, routes into the live player (#watch).
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

/** Live-ticking countdown to `at` (ms epoch). Empty once past/absent. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}

function fmt(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`
}

export function LivesIndex() {
  const [snap, setSnap] = useState<LiveSnapshot | null>(null)
  const [offline, setOffline] = useState(false)
  const now = useNow(true)

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
            <a href="#live" className="liveidx__tab is-active">
              <span className="landing__livedot" />LIVES
            </a>
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
            <ChannelCard key={c.id} channel={c} now={now} />
          ))}
        </section>
      </div>
    </div>
  )
}

function ChannelCard({ channel, now }: { channel: Channel; now: number }) {
  const { snap, offline } = channel
  const phase = snap?.phase ?? null
  const onAir = phase === 'live' || phase === 'rerun'
  const next = snap?.nextPremiereAt ?? null

  let status: string
  let kind: 'live' | 'soon' | 'idle'
  if (offline) {
    status = 'OFFLINE'
    kind = 'idle'
  } else if (phase === 'live') {
    status = 'ON AIR'
    kind = 'live'
  } else if (phase === 'rerun') {
    status = 'RERUN'
    kind = 'live'
  } else if (next && next > now) {
    status = `NEXT IN ${fmt(next - now)}`
    kind = 'soon'
  } else {
    status = 'STANDBY'
    kind = 'idle'
  }

  const topic = snap?.episode?.topic ?? (offline ? 'Channel is offline right now.' : 'Waiting for the next debate…')
  const inner = (
    <>
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
          <span className="livecard__listeners">{snap?.episode?.number ?? '—'}</span>
        )}
      </div>
    </>
  )

  // Only a playable channel routes into the live player.
  return onAir ? (
    <a className="livecard livecard--on" href="#watch">{inner}</a>
  ) : (
    <div className="livecard">{inner}</div>
  )
}
