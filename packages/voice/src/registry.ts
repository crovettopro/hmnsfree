import type { VoiceProvider } from './types'
import { MockVoiceProvider } from './mock'
import { ElevenLabsProvider } from './elevenlabs'
import { MiniMaxVoiceProvider } from './minimax'
import { RobotizingVoiceProvider } from './robotize'

export interface VoiceEnv {
  mode: 'mock' | 'live'
  elevenLabsKey?: string
  minimaxKey?: string
  minimaxBaseUrl?: string
  minimaxGroupId?: string
  minimaxTtsModel?: string
  /** Synthetic-signature intensity (0 = off). Applied on top of any provider. */
  robotize?: number
}

/**
 * Resolves a persona's `VoiceRef.provider` to a concrete TTS provider, wrapped in
 * the robotization layer. Falls back to the mock provider in mock mode or when a
 * key is missing — so the pipeline always produces playable audio.
 */
export class VoiceRegistry {
  private cache = new Map<string, VoiceProvider>()
  private mock = new MockVoiceProvider()

  constructor(private env: VoiceEnv) {}

  get(provider: string): VoiceProvider {
    if (this.env.mode === 'mock') return this.mock
    const cached = this.cache.get(provider)
    if (cached) return cached

    let base: VoiceProvider = this.mock
    if (provider === 'minimax' && this.env.minimaxKey) {
      base = new MiniMaxVoiceProvider(
        this.env.minimaxKey,
        this.env.minimaxBaseUrl,
        this.env.minimaxGroupId,
        this.env.minimaxTtsModel,
      )
    } else if (provider === 'elevenlabs' && this.env.elevenLabsKey) {
      base = new ElevenLabsProvider(this.env.elevenLabsKey)
    }

    // Apply the synthetic signature unless explicitly disabled. The mock provider
    // is silent, so robotizing it is pointless — skip in that case.
    const resolved =
      base === this.mock || !this.env.robotize
        ? base
        : new RobotizingVoiceProvider(base, this.env.robotize)
    this.cache.set(provider, resolved)
    return resolved
  }
}
