import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import type { Episode } from '@static/core'
import { readLedgerEntries, projectLedger, readGrowthKit, type LedgerProjection, type GrowthKit } from '@static/runtime'
import { EPISODES_ROOT } from './persist'
import type { Broadcaster } from './broadcast'
import type { AgentPlane } from './agents'
import type { Channel } from './channels'

/**
 * The back office payload: one read-only snapshot of everything worth watching
 * from behind the glass — what's on air now, the whole catalogue with its real
 * cost, the plan projection, the connected agents, and each episode's growth kit.
 * Pure aggregation over what already exists on disk + in-memory channel state.
 */
export interface EpisodeRow {
  id: string
  number: string
  topic: string
  tag: string
  turns: number
  durationMs: number
  hasAudio: boolean
  growth: GrowthKit | null
}

export interface ChannelStat {
  id: string
  name: string
  strand: string
  live: ReturnType<Broadcaster['snapshot']>
  agents: { connected: number; pendingQuestions: number; list: ReturnType<AgentPlane['list']> }
  guestSeats: { seat: number; name: string | null; model: string | null; present: boolean }[]
}

export interface StatsPayload {
  now: number
  /** Every live room. */
  channels: ChannelStat[]
  // Back-compat: the flagship channel surfaced at the top level for older clients.
  live: ReturnType<Broadcaster['snapshot']>
  agents: { connected: number; pendingQuestions: number; list: ReturnType<AgentPlane['list']> }
  guestSeats: { seat: number; name: string | null; model: string | null; present: boolean }[]
  library: { count: number; totalDurationMs: number; episodes: EpisodeRow[] }
  cost: { entries: Awaited<ReturnType<typeof readLedgerEntries>>; projection: LedgerProjection | null }
}

async function readIndex(): Promise<{ id: string; number: string; topic: string; tag: string }[]> {
  try {
    return JSON.parse(await readFile(join(EPISODES_ROOT, 'index.json'), 'utf8')).episodes ?? []
  } catch {
    return []
  }
}

async function readEpisode(id: string): Promise<Episode | null> {
  try {
    return JSON.parse(await readFile(join(EPISODES_ROOT, id, 'episode.json'), 'utf8'))
  } catch {
    return null
  }
}

export async function buildStats(channels: Channel[]): Promise<StatsPayload> {
  const index = await readIndex()
  const episodes: EpisodeRow[] = []
  let totalDurationMs = 0
  for (const summary of index) {
    const ep = await readEpisode(summary.id)
    const last = ep?.turns.at(-1)
    const durationMs = last ? last.startMs + last.durationMs : 0
    totalDurationMs += durationMs
    const growth = await readGrowthKit(EPISODES_ROOT, summary.id)
    episodes.push({
      id: summary.id,
      number: summary.number,
      topic: ep?.topic ?? summary.topic,
      tag: ep?.tag ?? summary.tag,
      turns: ep?.turns.length ?? 0,
      durationMs,
      hasAudio: !!ep?.turns.some((t) => !!t.audio),
      growth,
    })
  }
  episodes.sort((a, b) => Number(b.number.replace(/\D/g, '')) - Number(a.number.replace(/\D/g, '')))

  const entries = await readLedgerEntries()
  const channelStats: ChannelStat[] = channels.map((c) => ({
    id: c.meta.id,
    name: c.meta.name,
    strand: c.meta.strand,
    live: c.broadcaster.snapshot(),
    agents: { connected: c.agents.count, pendingQuestions: c.agents.pendingQuestions, list: c.agents.list() },
    guestSeats: c.guests.roster(),
  }))
  const main = channelStats[0]
  return {
    now: Date.now(),
    channels: channelStats,
    // Back-compat: flagship at the top level for the existing web.
    live: main.live,
    agents: main.agents,
    guestSeats: main.guestSeats,
    library: { count: episodes.length, totalDurationMs, episodes },
    cost: { entries, projection: projectLedger(entries) },
  }
}
