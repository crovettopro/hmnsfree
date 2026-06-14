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
          setEpisode({ ...ev.episode, turns })
          setEnded(false)
          setCursor(turns.length - 1)
          setThinking(turns.length === 0)
          break
        }
        case 'turn.opened':
          setThinking(true)
          break
        case 'turn.closed': {
          const turn: Turn = resolveTurn(ev.turn)
          setEpisode((prev) => {
            if (!prev) return prev
            // Append if it isn't already there (snapshot may include it).
            if (prev.turns.some((t) => t.id === turn.id)) return prev
            return { ...prev, turns: [...prev.turns, turn] }
          })
          setThinking(false)
          setCursor((c) => c + 1)
          turnBaseMsRef.current = turn.startMs
          turnStartRef.current = performance.now()
          setElapsed(turn.startMs)
          // Voice it. The visual timeline stays authoritative if it can't load.
          if (episodeCastRef.current) {
            engine.play(turn, episodeCastRef.current[turn.speaker], 1)
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
        case 'live.presence':
          setListeners(ev.listeners)
          break
        case 'live.status':
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
    episode && cursor >= 0 && episode.turns[cursor] ? episode.turns[cursor].speaker : -1

  return {
    connected, episode, chat, listeners, cursor, activeSpeaker, thinking, ended, elapsed,
    phase, nextPremiereAt, nextTopic, nextCast, rerunOf,
  }
}
