import type { AudioEngine } from './AudioEngine'
import type { Participant, Turn, VoiceHint } from '../../types'
import { VOICE_HINTS } from '../../data/cast'

/**
 * On-device text-to-speech via the Web Speech API. The default voice for seed
 * episodes (no pre-rendered audio): zero config, no API keys, a distinct system
 * voice per AI. Degrades to silence if unsupported. The player's clock stays
 * authoritative — this only voices the current turn and is cut off by stop().
 */
export class WebSpeechEngine implements AudioEngine {
  readonly supported: boolean
  private synth: SpeechSynthesis | null
  private voices: SpeechSynthesisVoice[] = []
  private current: SpeechSynthesisUtterance | null = null
  private onVoices = () => this.loadVoices()
  /** Fired when this turn starts being spoken (see AudioEngine.onClipStart). */
  onClipStart?: (turn: Turn) => void

  constructor() {
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis ?? null : null
    this.supported = !!this.synth
    if (this.synth) {
      this.loadVoices()
      this.synth.addEventListener?.('voiceschanged', this.onVoices)
    }
  }

  private loadVoices() {
    this.voices = this.synth?.getVoices() ?? []
  }

  private pickVoice(hint?: VoiceHint): SpeechSynthesisVoice | null {
    if (!this.voices.length) this.loadVoices()
    if (!this.voices.length) return null
    const lang = hint?.lang
    for (const want of hint?.prefer ?? []) {
      const v = this.voices.find(
        (v) =>
          v.name.toLowerCase().includes(want.toLowerCase()) &&
          (!lang || v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase())),
      )
      if (v) return v
    }
    if (lang) {
      const v = this.voices.find((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()))
      if (v) return v
    }
    return this.voices.find((v) => v.lang.toLowerCase().startsWith('en')) ?? this.voices[0]
  }

  /** Pace speech toward the turn's visual duration, nudged by hint + transport rate. */
  private computeRate(text: string, durationMs: number, hint?: VoiceHint, rate = 1): number {
    const words = text.trim().split(/\s+/).length
    const naturalSeconds = (words / 165) * 60
    const target = durationMs / 1000
    const fit = target > 0 ? naturalSeconds / target : 1
    return clamp(fit * (hint?.rate ?? 1) * rate, 0.6, 2.2)
  }

  play(turn: Turn, speaker: Participant, rate: number): void {
    if (!this.synth) return
    this.onClipStart?.(turn)
    this.synth.cancel()
    const hint = VOICE_HINTS[speaker.id]
    const u = new SpeechSynthesisUtterance(turn.text)
    const voice = this.pickVoice(hint)
    if (voice) {
      u.voice = voice
      u.lang = voice.lang
    } else if (hint?.lang) {
      u.lang = hint.lang
    }
    u.rate = this.computeRate(turn.text, turn.durationMs, hint, rate)
    u.pitch = clamp(hint?.pitch ?? 1, 0, 2)
    u.onend = () => {
      if (this.current === u) this.current = null
    }
    this.current = u
    this.synth.speak(u)
  }

  /** Unlock speechSynthesis from a user gesture (iOS gates it like audio). */
  unlock(): void {
    if (!this.synth) return
    try {
      const u = new SpeechSynthesisUtterance('')
      u.volume = 0
      this.synth.speak(u)
      this.synth.cancel()
    } catch {
      /* best-effort */
    }
  }

  stop(): void {
    this.current = null
    this.synth?.cancel()
  }

  destroy(): void {
    this.stop()
    this.synth?.removeEventListener?.('voiceschanged', this.onVoices)
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}
