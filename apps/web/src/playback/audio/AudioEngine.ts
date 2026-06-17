import type { Participant, Turn } from '../../types'

/**
 * The seam between "who is speaking now" (the visual timeline) and how that turn
 * is voiced. The player drives the authoritative clock and, on each turn change /
 * play / pause / seek, tells the engine what to do.
 *
 *   - SilentEngine     — no audio (pure simulated clock).
 *   - WebSpeechEngine  — on-device TTS from turn.text (seed episodes).
 *   - ClipAudioEngine  — plays a pre-rendered turn.audio clip (produced episodes).
 *   - CompositeEngine  — picks per turn: real clip if present, else WebSpeech.
 *
 * Swapping engines never touches the UI. The visual timeline is always
 * authoritative, so an engine that can't keep up simply stays silent.
 */
export interface AudioEngine {
  readonly supported: boolean
  /** Begin voicing a turn (replaces whatever was playing). */
  play(turn: Turn, speaker: Participant, rate: number): void
  /**
   * Voice a turn AFTER the current one finishes, instead of cutting it off. Used by
   * the live feed so back-to-back turns (esp. late-loading guest clips) play in order
   * without overlap. Optional — callers fall back to `play()` where it's unimplemented.
   */
  enqueue?(turn: Turn, speaker: Participant, rate: number): void
  /** Stop any current output immediately. */
  stop(): void
  /** Release resources / listeners. */
  destroy(): void
  /**
   * Unlock audio from a user gesture (a tap). Mobile browsers block programmatic
   * playback until audio has started once inside a real gesture; the live player
   * calls this on the "tap to listen" tap. No-op where not needed.
   */
  unlock?(): void
}

/** A no-op engine: the timeline runs, nothing is voiced. */
export class SilentEngine implements AudioEngine {
  readonly supported = true
  play(): void {}
  stop(): void {}
  destroy(): void {}
}
