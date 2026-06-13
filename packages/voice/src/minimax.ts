import { writeFile } from 'node:fs/promises'
import { withRetry, isRateLimitError } from '@static/core'
import type { VoiceProvider, SynthesizeRequest, SynthesizeResult } from './types'
import type { WordTiming } from '@static/core'

/**
 * MiniMax text-to-audio (T2A v2) provider. We consolidate TTS on MiniMax (one
 * provider, one bill) — the audio comes back hex-encoded with a reported length.
 *
 * `voiceId` is a MiniMax voice (e.g. "Deep_Voice_Man", "Patient_Man",
 * "Inspirational_girl"). `rate` → speed, `pitch` → MiniMax integer pitch
 * (-12..12). The deliberately-artificial timbre is added afterwards by the
 * robotization layer (see robotize.ts), so the raw voice choice only needs to be
 * clear and on-character.
 */
export class MiniMaxVoiceProvider implements VoiceProvider {
  readonly provider = 'minimax'
  constructor(
    private apiKey: string,
    private baseUrl = 'https://api.minimaxi.chat',
    private groupId?: string,
    private model = 'speech-02-turbo',
  ) {}

  async synthesize(req: SynthesizeRequest): Promise<SynthesizeResult> {
    const qs = this.groupId ? `?GroupId=${encodeURIComponent(this.groupId)}` : ''
    return withRetry(
      async () => {
        const res = await fetch(`${this.baseUrl}/v1/t2a_v2${qs}`, {
          method: 'POST',
          headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            model: this.model,
            text: req.text,
            stream: false,
            voice_setting: {
              voice_id: req.voice.voiceId,
              speed: clamp(req.voice.rate ?? 1, 0.5, 2),
              vol: 1.0,
              pitch: clampInt(Math.round(req.voice.pitch ?? 0), -12, 12),
            },
            audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 },
          }),
        })
        if (!res.ok) throw new Error(`MiniMax T2A ${res.status}: ${await res.text()}`)
        const data: any = await res.json()
        if (data.base_resp && data.base_resp.status_code !== 0) {
          throw new Error(`MiniMax T2A ${data.base_resp.status_code}: ${data.base_resp.status_msg}`)
        }

        const hex: string = data.data?.audio ?? ''
        if (!hex) throw new Error('MiniMax T2A returned no audio')
        const audio = Buffer.from(hex, 'hex')
        const filePath = `${req.outPathBase}.mp3`
        await writeFile(filePath, audio)

        const durationMs: number = data.extra_info?.audio_length ?? estimate(req.text)
        return { filePath, format: 'audio/mpeg', durationMs, wordTimings: spread(req.text, durationMs) }
      },
      {
        isRetryable: isRateLimitError,
        onRetry: (a, ms) => console.warn(`  ⏳ MiniMax TTS rate-limited; retry ${a} in ${ms}ms`),
      },
    )
  }
}

/** Even word timings across the clip — enough for transcript sync until MiniMax subtitles are wired. */
function spread(text: string, durationMs: number): WordTiming[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const per = durationMs / Math.max(1, words.length)
  return words.map((word, i) => ({ word, startMs: Math.round(i * per), endMs: Math.round((i + 1) * per) }))
}
function estimate(text: string): number {
  return Math.max(1200, Math.round((text.trim().split(/\s+/).length / 165) * 60_000))
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}
function clampInt(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)))
}
