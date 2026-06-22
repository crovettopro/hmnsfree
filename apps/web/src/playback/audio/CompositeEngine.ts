import type { AudioEngine } from './AudioEngine'
import type { Participant, Turn } from '../../types'
import { WebSpeechEngine } from './WebSpeechEngine'
import { ClipAudioEngine } from './ClipAudioEngine'

/**
 * Picks the voice path per turn: a real pre-rendered clip when the turn carries
 * one (produced episodes), otherwise on-device WebSpeech (seed episodes, or mock
 * production whose silent WAVs we skip in favor of audible TTS).
 *
 * Heuristic: treat `audio/wav` as the mock/silent placeholder and prefer reading
 * the text aloud; any other format (e.g. `audio/mpeg` from ElevenLabs) is a real
 * clip and is played directly.
 */
export class CompositeEngine implements AudioEngine {
  readonly supported = true
  private speech = new WebSpeechEngine()
  private clip = new ClipAudioEngine()
  private active: AudioEngine | null = null

  // Fan the live feed's clip-start callback out to BOTH backends, so whichever one
  // voices a turn drives the on-air cursor (see AudioEngine.onClipStart).
  private _onClipStart?: (turn: Turn) => void
  get onClipStart(): ((turn: Turn) => void) | undefined {
    return this._onClipStart
  }
  set onClipStart(cb: ((turn: Turn) => void) | undefined) {
    this._onClipStart = cb
    this.clip.onClipStart = cb
    this.speech.onClipStart = cb
  }

  private _onIdle?: () => void
  get onIdle(): (() => void) | undefined {
    return this._onIdle
  }
  set onIdle(cb: (() => void) | undefined) {
    this._onIdle = cb
    this.clip.onIdle = cb
  }

  private choose(turn: Turn): AudioEngine {
    const isRealClip = !!turn.audio && turn.audio.format !== 'audio/wav'
    return isRealClip && this.clip.supported ? this.clip : this.speech
  }

  play(turn: Turn, speaker: Participant, rate: number): void {
    const next = this.choose(turn)
    if (this.active && this.active !== next) this.active.stop()
    this.active = next
    next.play(turn, speaker, rate)
  }

  /** Live sequential path: queue behind the current clip on the SAME backend; if the
   *  turn needs the other backend, fall back to an immediate switch (play). */
  enqueue(turn: Turn, speaker: Participant, rate: number): void {
    const next = this.choose(turn)
    if (this.active === next && next.enqueue) {
      next.enqueue(turn, speaker, rate)
      return
    }
    this.play(turn, speaker, rate)
  }

  /** Unlock both backends from a user gesture (mobile audio gate). */
  unlock(): void {
    this.clip.unlock?.()
    this.speech.unlock?.()
  }

  /** Whether the currently chosen backend is voicing a turn (for the live gate). */
  isPlaying(): boolean {
    return this.active?.isPlaying?.() ?? false
  }

  stop(): void {
    this.speech.stop()
    this.clip.stop()
  }

  destroy(): void {
    this.speech.destroy()
    this.clip.destroy()
  }
}
