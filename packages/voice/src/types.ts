import type { VoiceRef, WordTiming } from '@static/core'

export interface SynthesizeRequest {
  text: string
  voice: VoiceRef
  /** Absolute path WITHOUT extension. The provider appends the correct one. */
  outPathBase: string
}

export interface SynthesizeResult {
  /** Final path written (with the provider's extension). Studio derives the URL. */
  filePath: string
  format: string
  durationMs: number
  wordTimings?: WordTiming[]
}

/**
 * The TTS seam — the server-side sibling of the player's AudioEngine. ElevenLabs
 * today; OpenAI/Azure/Google or a streaming provider later, all behind this.
 */
export interface VoiceProvider {
  readonly provider: string
  synthesize(req: SynthesizeRequest): Promise<SynthesizeResult>
}
