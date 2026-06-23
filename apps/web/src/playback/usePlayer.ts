import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Episode } from '../types'
import { fmtTime, fmtRate } from '@static/core'
import type { AudioEngine } from './audio/AudioEngine'

export const RATES = [1, 1.25, 1.5, 2] as const

// Re-export the shared formatters so components import them from one place.
export { fmtTime, fmtRate }

export interface PlayerState {
  playing: boolean
  /** Milliseconds into the episode. Source of truth for cursor + progress. */
  elapsedMs: number
  rate: number
}

export interface PlayerView {
  playing: boolean
  /** Current position, ms. */
  elapsed: number
  rate: number
  /** Total duration, ms. */
  total: number
  cursor: number
  started: boolean
  activeSpeaker: number
  progress: number
  /** Start time (ms) of each turn. */
  turnStarts: number[]
}

export interface PlayerControls {
  toggle: () => void
  seekFraction: (frac: number) => void
  /** Jump to an absolute position (ms) — used by click-to-seek on a transcript line. */
  seekMs: (ms: number) => void
  stepBack: () => void
  stepForward: () => void
  cycleRate: () => void
}

/**
 * The deterministic playback engine, in milliseconds (matching @static/core). A
 * single `elapsedMs` advanced by a requestAnimationFrame clock; the whole UI
 * derives from it. In production this clock is what you replace with the real
 * audio element's currentTime — the AudioEngine is already decoupled.
 */
/** A safe placeholder while the library is still loading (no episode selected). */
const EMPTY_EPISODE: Episode = {
  id: '',
  number: '',
  tag: '',
  topic: '',
  listeners: '',
  cast: [],
  turns: [],
  status: 'published',
}

export function usePlayer(
  episodeOrUndefined: Episode | undefined,
  engine: AudioEngine,
): PlayerView & PlayerControls {
  const episode = episodeOrUndefined ?? EMPTY_EPISODE
  const [state, setState] = useState<PlayerState>({ playing: false, elapsedMs: 0, rate: 1 })
  const raf = useRef<number | null>(null)
  const lastTs = useRef<number | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  const { total, turnStarts } = useMemo(() => {
    const starts = episode.turns.map((t) => t.startMs)
    const last = episode.turns[episode.turns.length - 1]
    return { total: last ? last.startMs + last.durationMs : 0, turnStarts: starts }
  }, [episode])

  const cursorAt = useCallback(
    (ms: number) => {
      const turns = episode.turns
      for (let i = 0; i < turns.length; i++) {
        if (ms < turns[i].startMs + turns[i].durationMs) return i
      }
      return turns.length - 1
    },
    [episode],
  )

  const loop = useCallback(
    (ts: number) => {
      if (!stateRef.current.playing) {
        raf.current = null
        lastTs.current = null
        return
      }
      if (lastTs.current == null) lastTs.current = ts
      const dt = (ts - lastTs.current) * stateRef.current.rate
      lastTs.current = ts
      const next = stateRef.current.elapsedMs + dt
      if (next >= total) {
        setState((s) => ({ ...s, elapsedMs: total, playing: false }))
        raf.current = null
        lastTs.current = null
        return
      }
      setState((s) => ({ ...s, elapsedMs: next }))
      raf.current = requestAnimationFrame(loop)
    },
    [total],
  )

  const ensureLoop = useCallback(() => {
    if (raf.current == null) {
      lastTs.current = null
      raf.current = requestAnimationFrame(loop)
    }
  }, [loop])

  const toggle = useCallback(() => {
    setState((s) => {
      const elapsedMs = !s.playing && s.elapsedMs >= total ? 0 : s.elapsedMs
      return { ...s, playing: !s.playing, elapsedMs }
    })
  }, [total])

  useEffect(() => {
    if (state.playing) ensureLoop()
    return () => {
      if (raf.current != null) {
        cancelAnimationFrame(raf.current)
        raf.current = null
        lastTs.current = null
      }
    }
  }, [state.playing, ensureLoop])

  const seekFraction = useCallback(
    (frac: number) => {
      const ms = Math.max(0, Math.min(1, frac)) * total
      setState((s) => ({ ...s, elapsedMs: ms }))
    },
    [total],
  )

  const seekMs = useCallback(
    (ms: number) => {
      setState((s) => ({ ...s, elapsedMs: Math.max(0, Math.min(total, ms)) }))
    },
    [total],
  )

  const stepBack = useCallback(() => {
    setState((s) => ({ ...s, elapsedMs: turnStarts[Math.max(0, cursorAt(s.elapsedMs) - 1)] ?? 0 }))
  }, [cursorAt, turnStarts])

  const stepForward = useCallback(() => {
    setState((s) => ({
      ...s,
      elapsedMs: turnStarts[Math.min(episode.turns.length - 1, cursorAt(s.elapsedMs) + 1)] ?? 0,
    }))
  }, [cursorAt, turnStarts, episode])

  const cycleRate = useCallback(() => {
    setState((s) => ({ ...s, rate: RATES[(RATES.indexOf(s.rate as 1) + 1) % RATES.length] }))
  }, [])

  // derived
  const elapsed = Math.min(state.elapsedMs, total)
  const cursor = cursorAt(elapsed)
  const started = state.playing || elapsed > 0
  const activeSpeaker = started && episode.turns[cursor] ? episode.turns[cursor].speaker : -1
  const progress = total ? elapsed / total : 0

  // audio: voice the active turn whenever it (or rate) changes; re-play on rate
  // change since on-device TTS can't retune mid-utterance.
  useEffect(() => {
    if (state.playing && started && episode.turns[cursor]) {
      const turn = episode.turns[cursor]
      engine.play(turn, episode.cast[turn.speaker], state.rate)
    } else {
      engine.stop()
    }
  }, [state.playing, cursor, started, state.rate, episode, engine])

  useEffect(() => () => engine.stop(), [engine, episode])

  return {
    playing: state.playing,
    elapsed,
    rate: state.rate,
    total,
    cursor,
    started,
    activeSpeaker,
    progress,
    turnStarts,
    toggle,
    seekFraction,
    seekMs,
    stepBack,
    stepForward,
    cycleRate,
  }
}
