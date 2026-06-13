import { spawn } from 'node:child_process'
import { rename } from 'node:fs/promises'
import type { VoiceProvider, SynthesizeRequest, SynthesizeResult } from './types'

/**
 * A "synthetic signature" post-processing layer. Wraps ANY VoiceProvider and,
 * after it renders a clip, runs ffmpeg to give the voice a deliberately
 * artificial, machine timbre — intelligible but clearly not human (the brand
 * rule). Intensity is tunable; we dial it in by ear.
 *
 * If ffmpeg isn't installed it passes the audio through untouched and warns once
 * (so the pipeline never breaks). Install with `brew install ffmpeg` to enable.
 */
export class RobotizingVoiceProvider implements VoiceProvider {
  readonly provider: string
  private static warned = false

  constructor(
    private inner: VoiceProvider,
    /** 0 = off (passthrough), 1 = default treatment. Scales the effect. */
    private intensity = 1,
  ) {
    this.provider = inner.provider
  }

  async synthesize(req: SynthesizeRequest): Promise<SynthesizeResult> {
    const result = await this.inner.synthesize(req)
    if (this.intensity <= 0) return result
    if (!(await ffmpegAvailable())) {
      if (!RobotizingVoiceProvider.warned) {
        console.warn(
          '⚠  Robotization skipped: ffmpeg not found. Install it (`brew install ffmpeg`) ' +
            'to give the voices their synthetic signature. Audio is currently raw TTS.',
        )
        RobotizingVoiceProvider.warned = true
      }
      return result
    }
    const out = result.filePath.replace(/(\.[a-z0-9]+)$/i, '.robot$1')
    await runFfmpeg(['-y', '-i', result.filePath, '-af', filterChain(this.intensity), out])
    await rename(out, result.filePath) // replace original in place
    return result
  }
}

/**
 * The synthetic-signature filter chain — a metallic, processed sheen that reads
 * as "machine" while staying fully intelligible and, crucially, audible. We
 * deliberately avoid the phase-zeroing robot trick (it craters the level to
 * near-silence); instead a phaser sweep + flanger doubling + comb echo give the
 * synthetic character, and a final loudnorm guarantees a consistent, audible
 * level. Scaled by `intensity`; tune by ear with STATIC_ROBOTIZE.
 */
function filterChain(intensity: number): string {
  const k = Math.max(0.2, Math.min(1.6, intensity))
  const phaserDecay = Math.min(0.6, 0.3 * k).toFixed(2)
  const flangerDepth = Math.min(4, 2 * k).toFixed(2)
  const echoDecay = Math.min(0.35, 0.14 * k).toFixed(2)
  return [
    'highpass=f=100',
    'lowpass=f=8200',
    `aphaser=type=t:speed=1.0:decay=${phaserDecay}`,
    `flanger=depth=${flangerDepth}:regen=10:speed=0.4`,
    `aecho=0.85:0.85:5:${echoDecay}`,
    // Normalize to a consistent, audible loudness regardless of the effects above.
    'loudnorm=I=-16:TP=-1.5:LRA=11',
  ].join(',')
}

let _ffmpeg: boolean | null = null
async function ffmpegAvailable(): Promise<boolean> {
  if (_ffmpeg != null) return _ffmpeg
  _ffmpeg = await new Promise<boolean>((resolve) => {
    const p = spawn('ffmpeg', ['-version'])
    p.on('error', () => resolve(false))
    p.on('close', (code) => resolve(code === 0))
  })
  return _ffmpeg
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', args, { stdio: 'ignore' })
    p.on('error', reject)
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))))
  })
}
