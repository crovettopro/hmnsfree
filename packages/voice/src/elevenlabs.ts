import { writeFile } from 'node:fs/promises'
import type { VoiceProvider, SynthesizeRequest, SynthesizeResult } from './types'
import type { WordTiming } from '@static/core'

interface ElevenAlignment {
  characters: string[]
  character_start_times_seconds: number[]
  character_end_times_seconds: number[]
}

/**
 * ElevenLabs TTS with character-level timestamps. We request the
 * `/with-timestamps` endpoint so each turn comes back with audio AND an
 * alignment we fold into word timings for transcript sync.
 *
 * `voiceId` must be a real voice from your ElevenLabs account (set in PERSONAS).
 */
export class ElevenLabsProvider implements VoiceProvider {
  readonly provider = 'elevenlabs'
  constructor(
    private apiKey: string,
    private modelId = 'eleven_multilingual_v2',
  ) {}

  async synthesize(req: SynthesizeRequest): Promise<SynthesizeResult> {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${req.voice.voiceId}/with-timestamps`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': this.apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        text: req.text,
        model_id: this.modelId,
        voice_settings: {
          // Tuned toward a controlled, synthetic delivery (see voice aesthetic):
          // higher stability + low style = flatter, less "actorly", more machine.
          stability: req.voice.stability ?? 0.75,
          similarity_boost: req.voice.similarity ?? 0.75,
          style: req.voice.style ?? 0,
          use_speaker_boost: true,
        },
      }),
    })
    if (!res.ok) {
      throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`)
    }
    const data = (await res.json()) as { audio_base64: string; alignment?: ElevenAlignment }

    const audio = Buffer.from(data.audio_base64, 'base64')
    const filePath = `${req.outPathBase}.mp3`
    await writeFile(filePath, audio)

    const { wordTimings, durationMs } = foldAlignment(data.alignment, req.text)
    return { filePath, format: 'audio/mpeg', durationMs, wordTimings }
  }
}

/** Collapse per-character timings into per-word timings. */
function foldAlignment(
  a: ElevenAlignment | undefined,
  text: string,
): { wordTimings?: WordTiming[]; durationMs: number } {
  if (!a || !a.characters?.length) {
    const words = text.trim().split(/\s+/).filter(Boolean)
    return { durationMs: Math.max(1200, Math.round((words.length / 165) * 60_000)) }
  }

  const words: WordTiming[] = []
  let cur = ''
  let startMs = 0
  let endMs = 0
  let inWord = false

  for (let i = 0; i < a.characters.length; i++) {
    const ch = a.characters[i]
    const s = Math.round(a.character_start_times_seconds[i] * 1000)
    const e = Math.round(a.character_end_times_seconds[i] * 1000)
    if (/\s/.test(ch)) {
      if (inWord) {
        words.push({ word: cur, startMs, endMs })
        cur = ''
        inWord = false
      }
    } else {
      if (!inWord) {
        startMs = s
        inWord = true
      }
      cur += ch
      endMs = e
    }
  }
  if (inWord && cur) words.push({ word: cur, startMs, endMs })

  const durationMs = words.length ? words[words.length - 1].endMs : 0
  return { wordTimings: words, durationMs }
}
