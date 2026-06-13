import type { Episode } from '@static/core'
import type { Broadcaster } from './broadcast'

const sleep = (ms: number) =>
  new Promise<void>((r) =>
    (globalThis as unknown as { setTimeout: (f: () => void, ms: number) => void }).setTimeout(r, ms),
  )

/**
 * Re-air a finished episode over the live stream in real time — the "rerun" that
 * keeps the channel always-on between premieres. It replays the SAME events a
 * live debate emits (so the web renders it identically), paced by each turn's
 * duration, and stops early if the premiere window arrives (deadline) or a new
 * listener round demands it (shouldStop).
 */
export async function rerunEpisode(
  episode: Episode,
  broadcaster: Broadcaster,
  opts: { deadlineMs: number; shouldStop: () => boolean },
): Promise<void> {
  // Reset the snapshot to this episode with no turns yet, so it builds up live.
  broadcaster.broadcast({ type: 'episode.scheduled', episode: { ...episode, turns: [] } })
  broadcaster.broadcast({ type: 'episode.started', episodeId: episode.id, startedAtMs: 0 })

  for (const turn of episode.turns) {
    if (opts.shouldStop() || Date.now() >= opts.deadlineMs) return
    broadcaster.broadcast({ type: 'turn.opened', turnId: turn.id, speaker: turn.speaker, directiveKind: 'argue' })
    broadcaster.broadcast({ type: 'turn.text', turnId: turn.id, text: turn.text })
    if (turn.audio) {
      broadcaster.broadcast({
        type: 'turn.audio',
        turnId: turn.id,
        url: turn.audio.url,
        durationMs: turn.audio.durationMs,
        wordTimings: turn.audio.wordTimings,
      })
    }
    broadcaster.broadcast({ type: 'turn.closed', turn })
    await sleep(turn.durationMs)
  }
  broadcaster.broadcast({ type: 'episode.ended', episodeId: episode.id, totalMs: episode.turns.reduce((s, t) => s + t.durationMs, 0) })
}
