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

  /** Unlock both backends from a user gesture (mobile audio gate). */
  unlock(): void {
    this.clip.unlock?.()
    this.speech.unlock?.()
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
