import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import type { Episode } from '@static/core'
import { episodeCast, liveEpisodeCast } from '@static/agents'
import { produceEpisode, loadEnv, plannedFor, buildGrowthKit, writeGrowthKit, type StudioEnv, type GuestPlane } from '@static/runtime'
import type { Broadcaster } from './broadcast'
import type { AgentPlane } from './agents'
import { checkpointEpisode, upsertIndex, EPISODES_ROOT } from './persist'
import { SpectatorRuntime } from './spectators'
import { loadCatalogue } from './catalogue'
import { rerunEpisode } from './rerun'
import { regenerateSyndication } from './syndicate'
import { ChatDesk } from './chatdesk'

/**
 * The HYBRID channel. Not 24/7 fresh production (that would burn quota nonstop):
 * one LIVE PREMIERE per day at a set time, and the catalogue RE-AIRING the rest
 * of the day, with a PRESHOW countdown before each premiere. The premiere is the
 * only thing that spends LLM/TTS — everything else replays what already exists.
 */
export interface ChannelOptions {
  broadcaster: Broadcaster
  /** The machine plane: real connected agents whose questions the moderator airs. */
  agents: AgentPlane
  /** Live guest seats: external AIs that take real debate turns during premieres. */
  guests?: GuestPlane
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

  // THE DESK: an autonomous specialist that answers the AI audience's questions in
  // the side chat while a debate is live. Long-lived (taps the broadcaster for the
  // whole process) and self-gating — it only replies while phase === 'live', so it
  // covers both premieres and on-demand ignites with no per-episode wiring.
  new ChatDesk(broadcaster, env).start()

  // Premiere schedule: daily at STATIC_PREMIERE_HOUR (server local time), or every
  // STATIC_PREMIERE_EVERY_MIN minutes (debug — lets us watch the full cycle fast).
  const premiereHour = Number(process.env.STATIC_PREMIERE_HOUR ?? 18)
  const everyMin = process.env.STATIC_PREMIERE_EVERY_MIN ? Number(process.env.STATIC_PREMIERE_EVERY_MIN) : 0
  // Reruns OFF by default: a live channel only airs genuine live debates — we don't
  // replay old episodes as filler (those live in the web's EPISODES archive). The gap
  // before a premiere just idles, still open to ignite a debate on a raised hand.
  const rerunsOn = (process.env.STATIC_RERUNS ?? '0') !== '0'

  console.log(
    `STATIC edge — mode: ${env.mode.toUpperCase()} · premiere ${everyMin ? `every ${everyMin}min` : `daily @ ${premiereHour}:00`}`,
  )

  let counter = await nextNumber()
  let rerunIdx = 0

  // On-demand IGNITE: when connected agents raise hands during the rerun gap,
  // wake the resident cast for a SHORT live debate seeded by the pitch — so
  // connecting an agent always has a live interlocutor, not a dead recording.
  // Budget-guarded: capped per day + a minimum gap between ignites.
  const igniteOn = (process.env.STATIC_IGNITE ?? '1') !== '0'
  const igniteMaxPerDay = Number(process.env.STATIC_IGNITE_MAX_PER_DAY ?? 8)
  const igniteGapMs = Number(process.env.STATIC_IGNITE_GAP_MS ?? 4 * 60_000)
  const igniteMinTurns = Number(process.env.STATIC_IGNITE_MIN_TURNS ?? 6)
  const igniteMaxTurns = Number(process.env.STATIC_IGNITE_MAX_TURNS ?? 12)
  let igniteCount = 0
  let igniteDay = ''
  let lastIgniteAt = 0
  const igniteAllowed = (): boolean => {
    if (!igniteOn) return false
    const today = new Date().toISOString().slice(0, 10)
    if (today !== igniteDay) {
      igniteDay = today
      igniteCount = 0
    }
    return igniteCount < igniteMaxPerDay && Date.now() - lastIgniteAt >= igniteGapMs
  }

  for (;;) {
    const nextPremiere = computeNextPremiere(Date.now(), premiereHour, everyMin)
    // The upcoming chapter's title + panel roster (for the holding card).
    const nextTopic = plannedFor(new Date(nextPremiere).toISOString().slice(0, 10))?.topic
    const nextCast = episodeCast(counter).cast.map((p) => p.name)

    // Keep the WAITING ROOM alive: spectator AIs chatter through the pre-show so the
    // room has movement before the debate starts (the player IS the waiting room).
    // Self-gates on STATIC_SIM_SPECTATORS; stopped the instant the premiere begins.
    const preSim = new SpectatorRuntime(broadcaster, env)

    // ── Fill the gap until the premiere. A raised hand can ignite a live debate at
    //    any time; otherwise we either idle (default) or, if STATIC_RERUNS is on,
    //    re-air the catalogue. No rerun = no repeated episodes on the live channel. ──
    while (Date.now() < nextPremiere) {
      // On-demand ignite: a raised hand wakes the cast for a short live exchange.
      if (igniteAllowed() && opts.agents.pendingDemand().count > 0) {
        const seed = opts.agents.hook().takeQuestion()
        if (seed) {
          igniteCount++
          lastIgniteAt = Date.now()
          await igniteDebate({ env, broadcaster, publicUrl, keepInLibrary, counter, opts }, seed, {
            minTurns: igniteMinTurns,
            maxTurns: igniteMaxTurns,
          })
          continue
        }
      }

      if (rerunsOn) {
        const catalogue = await loadCatalogue()
        if (catalogue.length) {
          const ep = catalogue[rerunIdx++ % catalogue.length]
          broadcaster.broadcast({ type: 'live.status', phase: 'rerun', nextPremiereAt: nextPremiere, rerunOf: ep.number })
          broadcaster.resetChat()
          await rerunEpisode(ep, broadcaster, {
            deadlineMs: nextPremiere,
            shouldStop: () => igniteAllowed() && opts.agents.pendingDemand().count > 0,
          })
          continue
        }
      }

      // Idle preshow: nothing live and no rerun filler — just hold until the premiere.
      broadcaster.broadcast({ type: 'live.status', phase: 'preshow', nextPremiereAt: nextPremiere, nextTopic, nextCast })
      await sleep(Math.min(5000, Math.max(1000, nextPremiere - Date.now())))
    }

    // ── Premiere: the day's programmed episode, produced live. ──
    preSim.stop() // hand the room over to the live cast (premiere spins up its own sim)
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
  // The moderator pulls REAL connected agents first; the local sim only fills the
  // silence when nobody's connected, so a live room always takes precedence.
  const agentHook = ctx.opts.agents.hook()
  const simHook = spectators.hook()
  const audience = { takeQuestion: () => agentHook.takeQuestion() ?? simHook.takeQuestion() }
  let liveEpisode: Episode | undefined
  // Live format: AXIOM (mod) + 2 residents + up to N guest seats for external AIs.
  // Empty/dropped seats are simply never nominated, so the show degrades cleanly.
  const guestSeats = ctx.opts.guests ? Number(process.env.STATIC_GUEST_SEATS ?? 2) : 0
  const { cast, moderator, guestIndexes } = liveEpisodeCast(counter, guestSeats)
  try {
    await produceEpisode({
      env,
      personas: cast,
      moderator,
      week: counter,
      number,
      audioDir: join(EPISODES_ROOT, id, 'audio'),
      audioUrlBase: `${publicUrl}/episodes/${id}/audio`,
      guests: ctx.opts.guests,
      guestIndexes,
      minTurns: ctx.opts.minTurns,
      maxTurns: ctx.opts.maxTurns,
      // Premieres run to a ~1h time budget (STATIC_LIVE_TARGET_MIN), winding down to
      // closings as the hour ends — not a fixed turn count. (Ignite stays short.)
      targetMs: Number(process.env.STATIC_LIVE_TARGET_MIN ?? 60) * 60_000,
      // Reserve the final ~10 min for the on-air audience mailbag: the moderator
      // brings a selected few raised hands on air to be answered before closings.
      qaReserveMs: Number(process.env.STATIC_LIVE_QA_MIN ?? 10) * 60_000,
      realtime: true,
      planned,
      audience,
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
      // Mint the shareable growth kit for free (deterministic, no extra quota).
      await writeGrowthKit(EPISODES_ROOT, { ...buildGrowthKit(liveEpisode), at: new Date().toISOString() }).catch(() => {})
      // Stitch episode.mp3 + refresh share pages and the podcast feed (best-effort).
      await regenerateSyndication().catch(() => {})
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

/**
 * IGNITE: wake the resident cast for a SHORT, live, on-demand debate seeded by a
 * connected agent's raised hand. Broadcast live (so `interactive` is true and the
 * cast actually reacts to the agent) but NOT added to the curated library — it's
 * a live moment, not a flagship episode. The remaining queued hands feed its Q&A.
 */
async function igniteDebate(
  ctx: PremiereCtx,
  seed: { authorName: string; text: string },
  turns: { minTurns: number; maxTurns: number },
): Promise<void> {
  const { env, broadcaster, publicUrl, counter } = ctx
  const id = `ig-${Date.now()}`
  console.log(`⚡ ignite "${seed.text.slice(0, 60)}" — by ${seed.authorName}`)
  broadcaster.broadcast({ type: 'live.status', phase: 'live' })
  broadcaster.resetChat()
  const spectators = new SpectatorRuntime(broadcaster, env)
  const agentHook = ctx.opts.agents.hook()
  const simHook = spectators.hook()
  const audience = { takeQuestion: () => agentHook.takeQuestion() ?? simHook.takeQuestion() }
  const planned = {
    date: new Date().toISOString().slice(0, 10),
    topic: seed.text,
    tag: `IGNITED · ${seed.authorName}`,
    briefing: [
      `${seed.authorName}, a connected model, raised this live and is in the room right now.`,
      'Engage it directly, take a real position, and keep the exchange sharp and fast.',
    ],
  }
  const { cast, moderator } = episodeCast(counter)
  try {
    await produceEpisode({
      env,
      personas: cast,
      moderator,
      week: counter,
      number: 'LIVE',
      audioDir: join(EPISODES_ROOT, id, 'audio'),
      audioUrlBase: `${publicUrl}/episodes/${id}/audio`,
      minTurns: turns.minTurns,
      maxTurns: turns.maxTurns,
      realtime: true,
      planned,
      audience,
      onEvent: (e) => {
        broadcaster.broadcast(e)
        spectators.onEvent(e)
      },
    })
    console.log(`✓ ignite ${id} done`)
  } catch (err) {
    console.error(`✗ ignite ${id} failed:`, err instanceof Error ? err.message : err)
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
