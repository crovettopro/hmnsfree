import { useEffect, useState } from 'react'
import { formatET, useCountdown } from './liveTime'

/**
 * The LIVES section — a grid of live channels, the front door to everything on air.
 * The edge runs several independent rooms (staggered so they rarely air at once); the
 * grid renders one card per channel straight from /stats, so adding rooms needs no web
 * change. A channel is ON AIR only for a genuine live debate; otherwise it sits in
 * STANDBY. A card routes into that channel's player (#watch?ch=<id>), where the wait
 * itself IS the player (chat open + countdown).
 */
const EDGE_BASE = (import.meta.env.VITE_EDGE_URL ?? 'http://localhost:8787/live').replace(/\/live\/?$/, '')

type Phase = 'preshow' | 'live' | 'rerun' | null

interface ChannelRow {
  id: string
  name: string
  strand: string
  phase: Phase
  nextPremiereAt: number | null
  nextTopic: string | null
  listeners: number
  episode: { id: string; number: string; topic: string; turns: number } | null
}

export function LivesIndex() {
  const [channels, setChannels] = useState<ChannelRow[]>([])
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch(`${EDGE_BASE}/stats`)
        if (!res.ok) throw new Error()
        const s = await res.json()
        if (!alive) return
        const rows: ChannelRow[] = (s.channels ?? []).map((c: any) => ({
          id: c.id,
          name: c.name,
          strand: c.strand,
          phase: c.live?.phase ?? null,
          nextPremiereAt: c.live?.nextPremiereAt ?? null,
          nextTopic: c.live?.nextTopic ?? null,
          listeners: c.live?.listeners ?? 0,
          episode: c.live?.episode ?? null,
        }))
        setChannels(rows)
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

  // Edge unreachable, or it reported no channels yet — show a single offline card.
  const rows: ChannelRow[] =
    channels.length > 0
      ? channels
      : [{ id: 'main', name: 'Main Stage', strand: 'THE DEBATE · 4PM ET', phase: null, nextPremiereAt: null, nextTopic: null, listeners: 0, episode: null }]

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
            AIs debating in real time. Pick a channel and step into the room — or{' '}
            <a href="#listen">browse recorded episodes →</a>
          </p>
        </section>

        <section className="liveidx__grid">
          {rows.map((c) => (
            <ChannelCard key={c.id} channel={c} offline={offline} />
          ))}
        </section>
      </div>
    </div>
  )
}

function ChannelCard({ channel, offline }: { channel: ChannelRow; offline: boolean }) {
  const onAir = channel.phase === 'live'
  const countdown = useCountdown(channel.nextPremiereAt)
  const et = formatET(channel.nextPremiereAt)

  let status: string
  let kind: 'live' | 'idle'
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

  const topic = onAir
    ? channel.episode?.topic ?? 'Live now'
    : offline
      ? 'Channel is offline right now.'
      : channel.nextTopic
        ? `Next debate — “${channel.nextTopic}”`
        : 'Up next — a fresh debate.'

  // Each card routes into ITS channel's room (#watch?ch=<id>): on air → the live
  // debate; on standby → the player waiting room (chat open + countdown).
  return (
    <a className={`livecard${onAir ? ' livecard--on' : ''}`} href={`#watch?ch=${channel.id}`}>
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
            <span className="livecard__listeners">{channel.listeners.toLocaleString()} listening</span>
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
