import type { AudioEngine } from './AudioEngine'
import type { Participant, Turn } from '../../types'

/**
 * Plays a turn's pre-rendered audio clip (produced episodes). This is the
 * production voice path — high-quality TTS or, later, live-streamed audio. The
 * player's clock stays authoritative; the clip is started/stopped to match.
 */
export class ClipAudioEngine implements AudioEngine {
  readonly supported = typeof Audio !== 'undefined'
  private el: HTMLAudioElement | null = this.supported ? new Audio() : null

  play(turn: Turn, _speaker: Participant, rate: number): void {
    if (!this.el || !turn.audio) return
    this.el.pause()
    this.el.src = turn.audio.url
    this.el.playbackRate = rate
    // Best-effort; browsers may block until a user gesture (the Play click counts).
    void this.el.play().catch(() => {})
  }

  stop(): void {
    if (!this.el) return
    this.el.pause()
  }

  destroy(): void {
    this.stop()
    if (this.el) this.el.src = ''
    this.el = null
  }
}
