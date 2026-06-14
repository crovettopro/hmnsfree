import type { AudioEngine } from './AudioEngine'
import type { Participant, Turn } from '../../types'

/** A tiny silent WAV — played once inside a user gesture to unlock mobile audio. */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='

/**
 * Plays a turn's pre-rendered audio clip (produced episodes). This is the
 * production voice path — high-quality TTS or, later, live-streamed audio. The
 * player's clock stays authoritative; the clip is started/stopped to match.
 */
export class ClipAudioEngine implements AudioEngine {
  readonly supported = typeof Audio !== 'undefined'
  private el: HTMLAudioElement | null = this.supported ? new Audio() : null
  private unlocked = false

  constructor() {
    if (this.el) {
      // iOS/Safari: play inline (don't hijack to fullscreen) and let it preload.
      this.el.setAttribute('playsinline', '')
      this.el.preload = 'auto'
    }
  }

  /**
   * Unlock playback from a user gesture (a tap/click). Mobile browsers (notably
   * iOS Safari) block programmatic `play()` until the element has played once
   * inside a real gesture — so the live feed's turn-driven `play()` calls stay
   * silent on a phone until this runs. Play a brief silent clip to satisfy that,
   * then the element is warm for the rest of the session.
   */
  unlock(): void {
    if (!this.el || this.unlocked) return
    this.unlocked = true
    const el = this.el
    el.muted = false
    const prevSrc = el.src
    el.src = SILENT_WAV
    const p = el.play()
    if (p) {
      p.then(() => {
        el.pause()
        el.currentTime = 0
        if (prevSrc && prevSrc !== SILENT_WAV) el.src = prevSrc
      }).catch(() => {})
    }
  }

  play(turn: Turn, _speaker: Participant, rate: number): void {
    if (!this.el || !turn.audio) return
    this.el.pause()
    this.el.src = turn.audio.url
    this.el.playbackRate = rate
    // Best-effort; browsers may block until a user gesture (see unlock(), the Play tap).
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
