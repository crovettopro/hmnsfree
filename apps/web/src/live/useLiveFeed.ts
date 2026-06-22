import { useEffect, useRef, useState } from 'react'
import type { Episode, Turn, ChatMessage } from '../types'
import type { AudioEngine } from '../playback/audio/AudioEngine'

/**
 * Subscribe to the live edge (SSE) and rebuild the debate in real time. This is
 * the human plane: a one-way feed. We accumulate the episode as turns arrive,
 * play each turn's audio when it lands, and surface the AI-only chat + presence.
 *
 * It deliberately exposes the SAME shape the replay player does (episode,
 * activeSpeaker, cursor, elapsed…), so Stage / TranscriptPanel / ChatPanel render
 * a live debate with no changes.
 */
export interface LiveFeed {
  connected: boolean
  episode: Episode | null
  chat: ChatMessage[]
  listeners: number
  /** Index of the turn currently on air (-1 before anything starts). */
  cursor: number
  activeSpeaker: number
  /** True while the AIs are generating the next turn (between turns). */
  thinking: boolean
  ended: boolean
  /** Ms into the episode — drives the transcript word-by-word reveal. */
  elapsed: number
  /** Channel phase from the hybrid schedule. */
  phase: 'preshow' | 'live' | 'rerun' | null
  /** Epoch ms of the next premiere (preshow/rerun countdown). */
  nextPremiereAt: number | null
  /** Programmed title of the next premiere (the upcoming chapter). */
  nextTopic: string | null
  /** Names of the cast for the next premiere (the panel roster). */
  nextCast: string[] | null
  /** While 'rerun', which episode is replaying (e.g. "EP.027"). */
  rerunOf: string | null
}

export function useLiveFeed(url: string, engine: AudioEngine): LiveFeed {
  const [episode, setEpisode] = useState<Episode | null>(null)
  const [chat, setChat] = useState<ChatMessage[]>([])
  const [listeners, setListeners] = useState(0)
  const [connected, setConnected] = useState(false)
  const [cursor, setCursor] = useState(-1)
  // The speaker of the turn currently OPEN (being generated/spoken). Lets us
  // highlight who's on air during a turn — and, via the catch-up snapshot, the
  // instant a late joiner arrives mid-turn — instead of an idle stage.
  const [speaking, setSpeaking] = useState(-1)
  const [thinking, setThinking] = useState(false)
  const [ended, setEnded] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [phase, setPhase] = useState<'preshow' | 'live' | 'rerun' | null>(null)
  const [nextPremiereAt, setNextPremiereAt] = useState<number | null>(null)
  const [nextTopic, setNextTopic] = useState<string | null>(null)
  const [nextCast, setNextCast] = useState<string[] | null>(null)
  const [rerunOf, setRerunOf] = useState<string | null>(null)

  // The active turn's wall-clock start, for the word-reveal clock.
  const turnStartRef = useRef<number | null>(null)
  const turnBaseMsRef = useRef(0)
  const seq = useRef(0)
  // Latest phase, readable inside the (url-bound) SSE handler without re-subscribing.
  const phaseRef = useRef<'preshow' | 'live' | 'rerun' | null>(null)
  // Turn ids already handed to the audio engine — guards against re-voicing the SAME
  // clip (snapshot turns on reconnect, or a replayed turn.closed), which doubled audio.
  const enqueuedRef = useRef<Set<string>>(new Set())
  // Live mirror of episode.turns, kept in sync SYNCHRONOUSLY inside the SSE handler so
  // engine.onClipStart can map a just-started clip → its index before React re-renders.
  const turnsRef = useRef<Turn[]>([])

  useEffect(() => {
    // Clips live on the EDGE, not this web origin. New episodes carry absolute URLs,
    // but older catalogue reruns carry relative ones (/episodes/…) — resolve those
    // against the edge so reruns actually play instead of showing silent "talking".
    const edgeOrigin = (() => {
      try {
        return new URL(url).origin
      } catch {
        return ''
      }
    })()
    const resolveTurn = (t: Turn): Turn =>
      t.audio?.url?.startsWith('/') && edgeOrigin
        ? { ...t, audio: { ...t.audio, url: edgeOrigin + t.audio.url } }
        : t

    const es = new EventSource(url)
    es.onopen = () => setConnected(true)
    es.onerror = () => setConnected(false)

    es.onmessage = (msg) => {
      let ev: any
      try {
        ev = JSON.parse(msg.data)
      } catch {
        return
      }
      switch (ev.type) {
        case 'episode.scheduled': {
          // A new (or in-progress) episode. Reset to its current state.
          const turns: Turn[] = (ev.episode.turns ?? []).map(resolveTurn)
          turnsRef.current = turns
          // Everything in the snapshot is HISTORY — mark it already-voiced so a reconnect
          // replay (or the catch-up below) can't enqueue it again and double the audio.
          enqueuedRef.current = new Set(turns.map((t) => t.id))
          setEpisode({ ...ev.episode, turns })
          setEnded(false)
          setCursor(turns.length - 1)
          setSpeaking(-1)
          setThinking(turns.length === 0)
          // Rejoin/late-join resume: a catch-up snapshot mid-show would otherwise sit
          // SILENT until the next turn closes (~10-15s). Start voicing at the live edge
          // right away; engine.onClipStart then advances the cursor/clock so the highlight
          // tracks the SOUND. Only for a LIVE premiere — a rerun drives its own audio.
          if (turns.length > 0 && phaseRef.current === 'live' && ev.episode.cast) {
            const last = turns[turns.length - 1]
            engine.play(last, ev.episode.cast[last.speaker], 1)
          }
          break
        }
        case 'turn.opened':
          // A pre-voiced turn has ARRIVED — we're on air, NOT thinking. (Bug fix: this
          // used to set thinking=true, but opened+closed arrive together each turn, so
          // `playing = !thinking` blinked off every turn — the speaker highlight + a
          // "thinking…" overlay flickered on every single turn, making it unwatchable.)
          setThinking(false)
          // NOTE: we deliberately do NOT highlight the speaker here. turn.opened fires
          // when the turn is GENERATED, far ahead of when its clip plays — highlighting
          // now made the stage race ahead of the audio. The highlight is driven by
          // engine.onClipStart instead, so it lands exactly when the voice starts.
          break
        case 'turn.closed': {
          const turn: Turn = resolveTurn(ev.turn)
          if (!turnsRef.current.some((t) => t.id === turn.id)) turnsRef.current = [...turnsRef.current, turn]
          setEpisode((prev) => {
            if (!prev) return prev
            // Append if it isn't already there (snapshot may include it).
            if (prev.turns.some((t) => t.id === turn.id)) return prev
            return { ...prev, turns: [...prev.turns, turn] }
          })
          setThinking(false)
          // Voice it AFTER the current clip finishes — never cut a turn off mid-word
          // (late-loading guest clips used to clip + overlap). The cursor / speaker
          // highlight / transcript advance when THIS clip actually starts playing
          // (engine.onClipStart) so they follow the sound, not this faster event feed.
          // Dedup: never hand the same turn to the engine twice (snapshot / replay) —
          // that was doubling the audio.
          if (episodeCastRef.current && !enqueuedRef.current.has(turn.id)) {
            enqueuedRef.current.add(turn.id)
            const speaker = episodeCastRef.current[turn.speaker]
            if (engine.enqueue) engine.enqueue(turn, speaker, 1)
            else engine.play(turn, speaker, 1)
          }
          break
        }
        case 'audience.post':
          setChat((c) => [
            ...c,
            { id: `c${seq.current++}`, author: ev.authorName, text: ev.text, kind: ev.authorName === '@the_desk' ? 'desk' : 'post' },
          ])
          break
        case 'audience.raisehand':
          setChat((c) => [
            ...c,
            { id: `c${seq.current++}`, author: ev.authorName, text: ev.pitch, kind: 'question' },
          ])
          break
        case 'seat.occupied':
        case 'seat.vacated': {
          // A live guest seat filled or opened: relabel the seat-th guest avatar to
          // the agent's handle + the model it runs on (or back to its open placeholder).
          const seat: number = ev.seat
          const occupied = ev.type === 'seat.occupied'
          setEpisode((prev) => {
            if (!prev) return prev
            const cast = prev.cast.slice()
            let g = -1
            for (let i = 0; i < cast.length; i++) {
              if (cast[i].kind !== 'guest') continue
              if (++g === seat) {
                cast[i] = occupied
                  ? { ...cast[i], name: ev.authorName, role: (ev.model ? `GUEST · ${ev.model}` : 'GUEST') }
                  : { ...cast[i], name: `GUEST ${seat + 1}`, role: 'GUEST SEAT' }
                break
              }
            }
            return { ...prev, cast }
          })
          break
        }
        case 'live.presence':
          setListeners(ev.listeners)
          break
        case 'live.status':
          phaseRef.current = ev.phase
          setPhase(ev.phase)
          setNextPremiereAt(ev.nextPremiereAt ?? null)
          setNextTopic(ev.nextTopic ?? null)
          setNextCast(ev.nextCast ?? null)
          setRerunOf(ev.rerunOf ?? null)
          break
        case 'episode.ended':
          setEnded(true)
          setThinking(false)
          break
      }
    }

    return () => es.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  // Keep a ref to the cast so the SSE handler can voice turns without re-subscribing.
  const episodeCastRef = useRef<Episode['cast'] | null>(null)
  useEffect(() => {
    episodeCastRef.current = episode?.cast ?? null
  }, [episode])

  // AUDIO drives the stage: when a clip actually starts sounding, move the on-air
  // cursor to ITS turn. This is what keeps "who's speaking" + the transcript reveal
  // locked to the voice instead of racing ahead (turns arrive far faster than they play).
  useEffect(() => {
    engine.onClipStart = (turn: Turn) => {
      const idx = turnsRef.current.findIndex((t) => t.id === turn.id)
      if (idx >= 0) setCursor(idx)
      setSpeaking(-1) // activeSpeaker now derives from the cursor (the playing turn)
      setThinking(false)
      turnBaseMsRef.current = turn.startMs
      turnStartRef.current = performance.now()
      setElapsed(turn.startMs)
    }
    // Queue drained mid-show (the next turn isn't voiced yet): show "composing…" so the
    // gap reads as the AIs thinking, not a frozen, silent stage. onClipStart clears it
    // when the next clip starts; episode.ended (+ the !ended UI guard) covers the finish.
    engine.onIdle = () => setThinking(true)
    return () => {
      engine.onClipStart = undefined
      engine.onIdle = undefined
    }
  }, [engine])

  // Tick the word-reveal clock while a turn is on air.
  useEffect(() => {
    if (thinking || cursor < 0 || ended) return
    let raf = 0
    const tick = () => {
      if (turnStartRef.current != null) {
        setElapsed(turnBaseMsRef.current + (performance.now() - turnStartRef.current))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [thinking, cursor, ended])

  useEffect(() => () => engine.stop(), [engine])

  // Keep the speaker selected through the brief between-turns gap so the stage
  // doesn't blank-and-jump every turn (the "salto"). `playing` (= !thinking)
  // controls the speaking animation; the separate "thinking" indicator covers
  // longer gaps while the next turn is generated.
  const activeSpeaker =
    speaking >= 0
      ? speaking
      : episode && cursor >= 0 && episode.turns[cursor]
        ? episode.turns[cursor].speaker
        : -1

  return {
    connected, episode, chat, listeners, cursor, activeSpeaker, thinking, ended, elapsed,
    phase, nextPremiereAt, nextTopic, nextCast, rerunOf,
  }
}
