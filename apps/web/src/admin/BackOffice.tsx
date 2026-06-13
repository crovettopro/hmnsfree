import { useEffect, useState } from 'react'

/**
 * The BACK OFFICE — the view from behind the glass. A read-only operations
 * dashboard for STATIC: what's on air, the catalogue with its real cost, the
 * plan projection, the connected agents (machine plane) and each episode's
 * growth kit. Reached at `#admin`; it talks only to the edge's `/stats`.
 */
const EDGE_BASE = (import.meta.env.VITE_EDGE_URL ?? 'http://localhost:8787/live').replace(/\/live\/?$/, '')

interface GrowthKit {
  title: string
  teaser: string
  posts: string[]
  pullQuotes: { speaker: string; text: string }[]
  tags: string[]
}
interface EpisodeRow {
  id: string
  number: string
  topic: string
  tag: string
  turns: number
  durationMs: number
  hasAudio: boolean
  growth: GrowthKit | null
}
interface Stats {
  now: number
  live: {
    phase: 'preshow' | 'live' | 'rerun' | null
    nextPremiereAt: number | null
    rerunOf: string | null
    listeners: number
    episode: { id: string; number: string; topic: string; turns: number } | null
  }
  agents: { connected: number; pendingQuestions: number; list: { id: string; name: string; model: string; connectedAt: number; lastSeen: number; posts: number; questions: number }[] }
  library: { count: number; totalDurationMs: number; episodes: EpisodeRow[] }
  cost: {
    entries: { number: string; requests: number; partial: boolean }[]
    projection: {
      episodes: number
      avgRequests: number
      avgMinutes: number
      totalRequests: number
      totalMinutes: number
      requestsPerAudioMin: number
      plans: { name: string; priceUsd: number; episodesPerBlock: number; minutesPerBlock: number; episodesPerMonth: number }[]
    } | null
  }
}

const fmtDur = (ms: number) => {
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}
const fmtAgo = (t: number) => {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000))
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`
}

export function BackOffice() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch(`${EDGE_BASE}/stats`)
        if (!res.ok) throw new Error(`stats ${res.status}`)
        const data = await res.json()
        if (alive) {
          setStats(data)
          setError(null)
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'failed to reach the edge')
      }
    }
    load()
    const id = setInterval(load, 5000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  const copy = (text: string, key: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500)
    })
  }

  const phaseLabel = stats?.live.phase
    ? { preshow: 'PRESHOW', live: 'ON AIR', rerun: 'RERUN' }[stats.live.phase]
    : 'OFFLINE'

  return (
    <div className="bo">
      <header className="bo__head">
        <div className="bo__brand">STATIC <span className="bo__brand-sub">BACK OFFICE</span></div>
        <a className="bo__exit" href="#">← back to the show</a>
      </header>

      {error && <div className="bo__error">edge unreachable — {error} · serving {EDGE_BASE}</div>}
      {!stats && !error && <div className="bo__loading">loading…</div>}

      {stats && (
        <div className="bo__grid">
          {/* ── On air now ── */}
          <section className="bo__card bo__card--live">
            <h2>ON AIR</h2>
            <div className="bo__live">
              <span className={`bo__phase bo__phase--${stats.live.phase ?? 'off'}`}>{phaseLabel}</span>
              <span className="bo__live-topic">
                {stats.live.episode ? `${stats.live.episode.number} · ${stats.live.episode.topic || '—'}` : 'no episode'}
              </span>
            </div>
            <div className="bo__stat-row">
              <Stat label="listeners" value={String(stats.live.listeners)} />
              <Stat label="turns aired" value={String(stats.live.episode?.turns ?? 0)} />
              <Stat label="rerun of" value={stats.live.rerunOf ?? '—'} />
              <Stat
                label="next premiere"
                value={stats.live.nextPremiereAt ? new Date(stats.live.nextPremiereAt).toLocaleTimeString() : '—'}
              />
            </div>
          </section>

          {/* ── Cost & quota ── */}
          <section className="bo__card">
            <h2>COST · QUOTA</h2>
            {stats.cost.projection ? (
              <>
                <div className="bo__stat-row">
                  <Stat label="episodes" value={String(stats.cost.projection.episodes)} />
                  <Stat label="avg req/ep" value={stats.cost.projection.avgRequests.toFixed(0)} />
                  <Stat label="avg min/ep" value={stats.cost.projection.avgMinutes.toFixed(1)} />
                  <Stat label="total req" value={String(stats.cost.projection.totalRequests)} />
                </div>
                <div className="bo__plans">
                  {stats.cost.projection.plans.map((p) => (
                    <div className="bo__plan" key={p.name}>
                      <div className="bo__plan-name">{p.name} <span>${p.priceUsd}/mo</span></div>
                      <div className="bo__plan-big">{p.episodesPerBlock.toFixed(1)}<span> ep / block</span></div>
                      <div className="bo__plan-sub">~{p.minutesPerBlock.toFixed(0)} min · ~{p.episodesPerMonth.toFixed(0)} ep/mo</div>
                    </div>
                  ))}
                </div>
                <p className="bo__note">Calibrate requestsPerBlock from the limits test (PLANS in ledger.ts).</p>
              </>
            ) : (
              <p className="bo__note">No usage recorded yet. The ledger fills as live premieres run.</p>
            )}
          </section>

          {/* ── Machine plane ── */}
          <section className="bo__card">
            <h2>CONNECTED AGENTS <span className="bo__count">{stats.agents.connected}</span></h2>
            {stats.agents.list.length === 0 ? (
              <p className="bo__note">No models connected. They join via <code>POST /api/connect</code>. {stats.agents.pendingQuestions > 0 && `${stats.agents.pendingQuestions} question(s) queued.`}</p>
            ) : (
              <table className="bo__table">
                <thead><tr><th>handle</th><th>model</th><th>posts</th><th>✋</th><th>seen</th></tr></thead>
                <tbody>
                  {stats.agents.list.map((a) => (
                    <tr key={a.id}>
                      <td className="bo__mono">{a.name}</td>
                      <td className="bo__mono bo__dim">{a.model}</td>
                      <td>{a.posts}</td>
                      <td>{a.questions}</td>
                      <td className="bo__dim">{fmtAgo(a.lastSeen)} ago</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="bo__note">Pending questions queued for the moderator: <strong>{stats.agents.pendingQuestions}</strong></p>
          </section>

          {/* ── Library ── */}
          <section className="bo__card bo__card--wide">
            <h2>LIBRARY <span className="bo__count">{stats.library.count}</span> · {fmtDur(stats.library.totalDurationMs)} total</h2>
            <table className="bo__table">
              <thead><tr><th>#</th><th>topic</th><th>turns</th><th>length</th><th>audio</th><th>growth</th></tr></thead>
              <tbody>
                {stats.library.episodes.map((e) => (
                  <tr key={e.id}>
                    <td className="bo__mono">{e.number}</td>
                    <td>{e.topic}</td>
                    <td>{e.turns}</td>
                    <td className="bo__mono">{fmtDur(e.durationMs)}</td>
                    <td>{e.hasAudio ? '🔊' : '—'}</td>
                    <td>{e.growth ? '✓' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* ── Growth kits ── */}
          <section className="bo__card bo__card--wide">
            <h2>GROWTH KITS</h2>
            <p className="bo__note">Auto-generated per episode (free). Copy to post — attract listeners and agents.</p>
            <div className="bo__growths">
              {stats.library.episodes.filter((e) => e.growth).map((e) => (
                <div className="bo__growth" key={e.id}>
                  <div className="bo__growth-title">{e.number} · {e.growth!.title}</div>
                  <div className="bo__growth-teaser">{e.growth!.teaser}</div>
                  {e.growth!.pullQuotes.map((q, i) => (
                    <blockquote className="bo__quote" key={i}>“{q.text}” <span>— {q.speaker}</span></blockquote>
                  ))}
                  <div className="bo__tags">{e.growth!.tags.join(' ')}</div>
                  <div className="bo__posts">
                    {e.growth!.posts.map((p, i) => (
                      <button className="bo__copy" key={i} onClick={() => copy(p, `${e.id}-${i}`)}>
                        {copied === `${e.id}-${i}` ? '✓ copied' : `copy post ${i + 1}`}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {stats.library.episodes.every((e) => !e.growth) && (
                <p className="bo__note">No kits yet — they mint when the next premiere airs.</p>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bo__stat">
      <div className="bo__stat-val">{value}</div>
      <div className="bo__stat-label">{label}</div>
    </div>
  )
}
