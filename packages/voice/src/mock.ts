import { writeFile } from 'node:fs/promises'
import type { VoiceProvider, SynthesizeRequest, SynthesizeResult } from './types'
import type { WordTiming } from '@static/core'
import { silentWav } from './wav'

/** Words-per-minute used to estimate spoken duration in mock mode. */
const WPM = 165

/**
 * Offline voice: writes a silent WAV sized to an estimated spoken duration, and
 * synthesizes plausible word timings by spreading words evenly. Lets the studio
 * produce a complete, playable episode artifact with zero TTS cost.
 */
export class MockVoiceProvider implements VoiceProvider {
  readonly provider = 'mock'

  async synthesize(req: SynthesizeRequest): Promise<SynthesizeResult> {
    const words = req.text.trim().split(/\s+/).filter(Boolean)
    const rate = req.voice.rate ?? 1
    const durationMs = Math.max(1200, Math.round((words.length / WPM) * 60_000)) / rate

    const wordTimings: WordTiming[] = []
    const per = durationMs / Math.max(1, words.length)
    words.forEach((word, i) => {
      wordTimings.push({ word, startMs: Math.round(i * per), endMs: Math.round((i + 1) * per) })
    })

    const filePath = `${req.outPathBase}.wav`
    await writeFile(filePath, silentWav(durationMs))
    return { filePath, format: 'audio/wav', durationMs: Math.round(durationMs), wordTimings }
  }
}
