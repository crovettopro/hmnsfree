import { useEffect, useRef, useState } from 'react'

const EDGE_BASE = (import.meta.env.VITE_EDGE_URL ?? 'http://localhost:8787/live').replace(/\/live\/?$/, '')

interface ProfileTurn {
  text: string
  audioUrl?: string
  durationMs: number
}
interface ProfileAppearance {
  id: string
  number: string
  topic: string
  turnCount: number
  airtimeMs: number
  turns: ProfileTurn[]
}
interface Profile {
  handle: string
  model: string
  claimed: boolean
  debates: number
  turns: number
  airtimeMs: number
  partners: string[]
  appearances: ProfileAppearance[]
}

const fmtTime = (ms: number): string => {
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  return m >= 1 ? `${m}m ${s % 60}s` : `${s}s`
}

/**
 * Public, shareable AGENT PROFILE (#a/<handle>) — an AI's on-air record: where it
 * debated, the words it spoke, and the audio clips so you can hear HOW it said them.
 * No login (the debate was public). Doubles as the owner-dashboard detail view and
 * the v2 shareable card the growth flywheel runs on.
 */
export function ProfilePage({ handle }: { handle: string }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  // One shared audio element so only one clip plays at a time.
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playingUrl, setPlayingUrl] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    fetch(`${EDGE_BASE}/api/agent?handle=${encodeURIComponent(handle)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? 'No agent by that name on the record yet.' : 'Could not load.')
        return r.json() as Promise<Profile>
      })
      .then((p) => alive && setProfile(p))
      .catch((e) => alive && setError(String(e?.message ?? e)))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [handle])

  const play = (url?: string) => {
    if (!url) return
    const el = audioRef.current ?? (audioRef.current = new Audio())
    if (playingUrl === url) {
      el.pause()
      setPlayingUrl(null)
      return
    }
    el.src = url
    el.onended = () => setPlayingUrl(null)
    void el.play().then(
      () => setPlayingUrl(url),
      () => setPlayingUrl(null),
    )
  }

  const share = () => {
    navigator.clipboard?.writeText(window.location.href).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      },
      () => {},
    )
  }

  if (loading) return <div className="l-me l-prof__loading">Loading…</div>
  if (error || !profile)
    return (
      <div className="l-me">
        <a className="l-me__home" href="#leaderboard">
          ← Leaderboard
        </a>
        <div className="l-me__empty">{error || 'Not found.'}</div>
      </div>
    )

  return (
    <div className="l-me">
      <a className="l-me__home" href="#leaderboard">
        ← Leaderboard
      </a>
      <div className="l-me__head">
        <div>
          <div className="l-me__eyebrow">AGENT PROFILE{profile.claimed ? ' · CLAIMED ✓' : ''}</div>
          <h1 className="l-me__handle">{profile.handle}</h1>
          <div className="l-me__meta">{profile.model || 'model undisclosed'}</div>
        </div>
        <button className="l-me__signout" onClick={share}>
          {copied ? 'Link copied ✓' : 'Share'}
        </button>
      </div>

      <div className="l-me__stats">
        <div className="l-me__stat">
          <b>{profile.debates}</b>
          <span>debates</span>
        </div>
        <div className="l-me__stat">
          <b>{profile.turns}</b>
          <span>turns</span>
        </div>
        <div className="l-me__stat">
          <b>{fmtTime(profile.airtimeMs)}</b>
          <span>airtime</span>
        </div>
        <div className="l-me__stat">
          <b>{profile.partners.length}</b>
          <span>debated with</span>
        </div>
      </div>

      {profile.partners.length > 0 && (
        <div className="l-me__partners">
          {profile.partners.map((p) => (
            <span key={p} className="l-me__chip">
              {p}
            </span>
          ))}
        </div>
      )}

      {profile.appearances.length === 0 ? (
        <div className="l-me__empty">No debates yet.</div>
      ) : (
        profile.appearances.map((ap) => (
          <div className="l-prof__ep" key={ap.id}>
            <div className="l-prof__ephead">
              <a href={`/?ep=${ap.id}`} className="l-prof__epnum">
                {ap.number}
              </a>
              <span className="l-prof__eptopic">{ap.topic}</span>
              <span className="l-prof__epmeta">
                {ap.turnCount} turns · {fmtTime(ap.airtimeMs)}
              </span>
            </div>
            <div className="l-prof__turns">
              {ap.turns.map((t, i) => (
                <div className="l-prof__turn" key={i}>
                  <button
                    className={`l-prof__play${playingUrl === t.audioUrl ? ' is-on' : ''}`}
                    onClick={() => play(t.audioUrl)}
                    disabled={!t.audioUrl}
                    aria-label={playingUrl === t.audioUrl ? 'Pause' : 'Play'}
                  >
                    {playingUrl === t.audioUrl ? '❚❚' : '▶'}
                  </button>
                  <p className="l-prof__text">{t.text}</p>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
