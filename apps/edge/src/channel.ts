import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import type { Episode } from '@static/core'
import { EPISODE_CAST, EPISODE_MODERATOR } from '@static/agents'
import { produceEpisode, loadEnv, plannedFor, type StudioEnv } from '@static/runtime'
import type { Broadcaster } from './broadcast'
import { checkpointEpisode, upsertIndex, EPISODES_ROOT } from './persist'
import { SpectatorRuntime } from './spectators'

/**
 * The always-on channel: produce episodes back to back, broadcasting every event
 * the instant it happens and checkpointing to disk (VOD). This is the live edge —
 * the same orchestrator the studio runs offline, sunk into a real-time fan-out
 * instead of a return value.
 */
export interface ChannelOptions {
  broadcaster: Broadcaster
  /** Seconds of intermission between episodes. */
  intermissionSec?: number
  minTurns?: number
  maxTurns?: number
}

const sleep = (ms: number) =>
  new Promise<void>((r) => (globalThis as unknown as { setTimeout: (f: () => void, ms: number) => void }).setTimeout(r, ms))

export async function runChannel(opts: ChannelOptions): Promise<void> {
  const env = loadEnv()
  const { broadcaster } = opts
  // Audio is served BY the edge (see static.ts), so URLs are absolute to the
  // edge's public origin — the web (another origin in prod) fetches clips here.
  const publicUrl = (
    process.env.STATIC_EDGE_PUBLIC_URL ??
    `http://localhost:${process.env.PORT ?? process.env.STATIC_EDGE_PORT ?? 8787}`
  ).replace(/\/$/, '')
  // Only real (live-mode) episodes join the permanent VOD library; mock-sim runs
  // stream + checkpoint to disk but stay out of the browser index to avoid junk.
  const keepInLibrary = env.mode === 'live'
  console.log(`STATIC edge — mode: ${env.mode.toUpperCase()} (VOD library: ${keepInLibrary ? 'on' : 'off'})`)

  let counter = await nextNumber()
  // The channel never stops; the process staying alive IS the live stream.
  for (;;) {
    const number = String(counter)
    const id = `ep-${number.padStart(3, '0')}`
    broadcaster.resetChat()

    // The day's programmed topic + briefing (editorial calendar); autonomous if none.
    const planned = plannedFor(new Date().toISOString().slice(0, 10))

    // Spectator AIs watch this episode's events and chat / raise hands.
    const spectators = new SpectatorRuntime(broadcaster, env)

    let liveEpisode: Episode | undefined
    try {
      await produceEpisode({
        env,
        personas: EPISODE_CAST,
        moderator: EPISODE_MODERATOR,
        week: counter,
        number,
        audioDir: join(EPISODES_ROOT, id, 'audio'),
        audioUrlBase: `${publicUrl}/episodes/${id}/audio`,
        minTurns: opts.minTurns,
        maxTurns: opts.maxTurns,
        realtime: true, // live edge: unfold the debate on a real-time broadcast clock
        planned,
        audience: spectators.hook(),
        onEvent: (e) => {
          if (e.type === 'episode.scheduled') {
            liveEpisode = e.episode
            if (keepInLibrary) void upsertIndex(e.episode) // findable while still live
          }
          broadcaster.broadcast(e)
          spectators.onEvent(e)
          if (e.type === 'turn.closed' && liveEpisode) void checkpointEpisode(liveEpisode).catch(() => {})
        },
      })
      if (liveEpisode) {
        await checkpointEpisode(liveEpisode)
        if (keepInLibrary) await upsertIndex(liveEpisode)
      }
      console.log(`✓ ${id} aired (${liveEpisode?.turns.length ?? 0} turns)`)
    } catch (err) {
      console.error(`✗ ${id} failed:`, err instanceof Error ? err.message : err)
      if (liveEpisode?.turns.length) {
        await checkpointEpisode(liveEpisode)
        if (keepInLibrary) await upsertIndex(liveEpisode)
      }
    } finally {
      spectators.stop()
    }

    counter++
    await sleep((opts.intermissionSec ?? 8) * 1000)
  }
}

/** Next episode number = continue after whatever's already in the library. */
async function nextNumber(): Promise<number> {
  try {
    const idx = JSON.parse(await readFile(join(EPISODES_ROOT, 'index.json'), 'utf8'))
    const nums = (idx.episodes ?? []).map((e: { number: string }) => Number(e.number.replace(/\D/g, '')))
    return (nums.length ? Math.max(...nums) : 26) + 1
  } catch {
    return 27
  }
}
