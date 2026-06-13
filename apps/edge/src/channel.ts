import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import type { Episode } from '@static/core'
import { EPISODE_CAST, EPISODE_MODERATOR } from '@static/agents'
import { produceEpisode, loadEnv, plannedFor, type StudioEnv } from '@static/runtime'
import type { Broadcaster } from './broadcast'
import { checkpointEpisode, upsertIndex, EPISODES_ROOT } from './persist'
import { SpectatorRuntime } from './spectators'
import { loadCatalogue } from './catalogue'
import { rerunEpisode } from './rerun'

/**
 * The HYBRID channel. Not 24/7 fresh production (that would burn quota nonstop):
 * one LIVE PREMIERE per day at a set time, and the catalogue RE-AIRING the rest
 * of the day, with a PRESHOW countdown before each premiere. The premiere is the
 * only thing that spends LLM/TTS — everything else replays what already exists.
 */
export interface ChannelOptions {
  broadcaster: Broadcaster
  minTurns?: number
  maxTurns?: number
}

const sleep = (ms: number) =>
  new Promise<void>((r) => (globalThis as unknown as { setTimeout: (f: () => void, ms: number) => void }).setTimeout(r, ms))

export async function runChannel(opts: ChannelOptions): Promise<void> {
  const env = loadEnv()
  const { broadcaster } = opts
  const publicUrl = (
    process.env.STATIC_EDGE_PUBLIC_URL ??
    `http://localhost:${process.env.PORT ?? process.env.STATIC_EDGE_PORT ?? 8787}`
  ).replace(/\/$/, '')
  const keepInLibrary = env.mode === 'live'

  // Premiere schedule: daily at STATIC_PREMIERE_HOUR (server local time), or every
  // STATIC_PREMIERE_EVERY_MIN minutes (debug — lets us watch the full cycle fast).
  const premiereHour = Number(process.env.STATIC_PREMIERE_HOUR ?? 18)
  const everyMin = process.env.STATIC_PREMIERE_EVERY_MIN ? Number(process.env.STATIC_PREMIERE_EVERY_MIN) : 0

  console.log(
    `STATIC edge — mode: ${env.mode.toUpperCase()} · premiere ${everyMin ? `every ${everyMin}min` : `daily @ ${premiereHour}:00`}`,
  )

  let counter = await nextNumber()
  let rerunIdx = 0

  for (;;) {
    const nextPremiere = computeNextPremiere(Date.now(), premiereHour, everyMin)

    // ── Fill the gap until the premiere: re-air the catalogue, counting down. ──
    while (Date.now() < nextPremiere) {
      const catalogue = await loadCatalogue()
      if (!catalogue.length) {
        broadcaster.broadcast({ type: 'live.status', phase: 'preshow', nextPremiereAt: nextPremiere })
        await sleep(Math.min(5000, Math.max(1000, nextPremiere - Date.now())))
        continue
      }
      const ep = catalogue[rerunIdx++ % catalogue.length]
      broadcaster.broadcast({ type: 'live.status', phase: 'rerun', nextPremiereAt: nextPremiere, rerunOf: ep.number })
      broadcaster.resetChat()
      await rerunEpisode(ep, broadcaster, { deadlineMs: nextPremiere, shouldStop: () => false })
    }

    // ── Premiere: the day's programmed episode, produced live. ──
    broadcaster.broadcast({ type: 'live.status', phase: 'live' })
    await producePremiere({ env, broadcaster, publicUrl, keepInLibrary, counter, opts })
    counter++
  }
}

interface PremiereCtx {
  env: StudioEnv
  broadcaster: Broadcaster
  publicUrl: string
  keepInLibrary: boolean
  counter: number
  opts: ChannelOptions
}

/** Produce and broadcast ONE live episode (the premiere), then persist it as VOD. */
async function producePremiere(ctx: PremiereCtx): Promise<void> {
  const { env, broadcaster, publicUrl, keepInLibrary, counter } = ctx
  const number = String(counter)
  const id = `ep-${number.padStart(3, '0')}`
  broadcaster.resetChat()

  const planned = plannedFor(new Date().toISOString().slice(0, 10))
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
      minTurns: ctx.opts.minTurns,
      maxTurns: ctx.opts.maxTurns,
      realtime: true,
      planned,
      audience: spectators.hook(),
      onEvent: (e) => {
        if (e.type === 'episode.scheduled') {
          liveEpisode = e.episode
          if (keepInLibrary) void upsertIndex(e.episode)
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
    console.log(`✓ premiere ${id} aired (${liveEpisode?.turns.length ?? 0} turns)`)
  } catch (err) {
    console.error(`✗ premiere ${id} failed:`, err instanceof Error ? err.message : err)
    if (liveEpisode?.turns.length) {
      await checkpointEpisode(liveEpisode)
      if (keepInLibrary) await upsertIndex(liveEpisode)
    }
  } finally {
    spectators.stop()
  }
}

/** Epoch ms of the next premiere: every N minutes (debug) or daily at `hour`. */
function computeNextPremiere(now: number, hour: number, everyMin: number): number {
  if (everyMin > 0) return now + everyMin * 60000
  const d = new Date(now)
  d.setHours(hour, 0, 0, 0)
  let t = d.getTime()
  if (t <= now) t += 86400000
  return t
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
