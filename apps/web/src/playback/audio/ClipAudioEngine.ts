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
interface QueuedClip {
  turn: Turn
  rate: number
}

/**
 * In a LIVE show, guest clips often arrive late from the CDN (a fresh, uncached
 * voice). The old behaviour cut the current clip off the instant the next turn
 * landed — so a guest got clipped mid-sentence and turns audibly overlapped. We
 * keep a small play QUEUE: `enqueue()` plays clips back-to-back (each waits for the
 * previous to `ended`), so nothing is cut. `play()` stays the immediate-interrupt
 * path for a seek / live-edge jump (it clears the queue). A safety cap keeps the
 * backlog from growing without bound if turns ever outrun real time.
 */
const MAX_BACKLOG = 6

export class ClipAudioEngine implements AudioEngine {
  readonly supported = typeof Audio !== 'undefined'
  private el: HTMLAudioElement | null = this.supported ? new Audio() : null
  private unlocked = false
  private queue: QueuedClip[] = []
  private busy = false

  constructor() {
    if (this.el) {
      // iOS/Safari: play inline (don't hijack to fullscreen) and let it preload.
      this.el.setAttribute('playsinline', '')
      this.el.preload = 'auto'
      // Advance the queue when a clip finishes — or fails to load (404 / decode
      // error), so one bad guest clip can't stall the whole live stream.
      this.el.addEventListener('ended', () => this.advance())
      // Only a genuine load/decode failure (el.error set) advances — NOT the benign
      // abort that fires when we swap src for the next clip.
      this.el.addEventListener('error', () => {
        if (this.el?.error) this.advance()
      })
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
    // If a real clip is already sounding (desktop autoplay), the element is ALREADY
    // unlocked — running the silent-WAV trick here would swap the live clip's src for
    // silence, pause it, and never resume: the audio just dies. Mark unlocked and
    // leave playback untouched. The trick only runs when nothing is playing (mobile,
    // where the feed's play() calls were blocked until this gesture).
    if (this.busy && !el.paused) return
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

  /** Immediate: interrupt whatever's playing and start this clip now (seek / jump). */
  play(turn: Turn, _speaker: Participant, rate: number): void {
    if (!this.el || !turn.audio) return
    this.queue = []
    this.start(turn, rate)
  }

  /** Sequential: voice this turn after the current clip ends — never cut it off. */
  enqueue(turn: Turn, _speaker: Participant, rate: number): void {
    if (!this.el || !turn.audio) return
    if (!this.busy) {
      this.start(turn, rate)
      return
    }
    this.queue.push({ turn, rate })
    // Don't let a backlog grow unbounded: keep only the most recent clips so audio
    // can't drift minutes behind the live edge (drops the oldest unplayed turns).
    if (this.queue.length > MAX_BACKLOG) this.queue.splice(0, this.queue.length - MAX_BACKLOG)
  }

  private start(turn: Turn, rate: number): void {
    if (!this.el || !turn.audio) return
    this.busy = true
    this.el.pause()
    this.el.src = turn.audio.url
    this.el.playbackRate = rate
    // Best-effort; browsers may block until a user gesture (see unlock(), the Play tap).
    void this.el.play().catch(() => {})
  }

  private advance(): void {
    const next = this.queue.shift()
    if (next) this.start(next.turn, next.rate)
    else this.busy = false
  }

  /** True while a real clip is actively sounding (not paused / idle). */
  isPlaying(): boolean {
    return !!this.el && !this.el.paused && this.busy
  }

  stop(): void {
    this.queue = []
    this.busy = false
    if (!this.el) return
    this.el.pause()
  }

  destroy(): void {
    this.stop()
    if (this.el) this.el.src = ''
    this.el = null
  }
}
