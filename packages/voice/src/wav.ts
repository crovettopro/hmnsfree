/**
 * Build a valid silent PCM WAV of a given duration. Used by the mock voice
 * provider so the whole pipeline writes real, playable audio files (and the
 * player can run the clip path) without any TTS API or cost.
 */
export function silentWav(durationMs: number): Buffer {
  const sampleRate = 8000 // low rate — silence compresses to nothing meaningful anyway
  const numSamples = Math.max(1, Math.round((durationMs / 1000) * sampleRate))
  const dataBytes = numSamples // 8-bit mono
  const buffer = Buffer.alloc(44 + dataBytes)

  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(36 + dataBytes, 4)
  buffer.write('WAVE', 8, 'ascii')
  buffer.write('fmt ', 12, 'ascii')
  buffer.writeUInt32LE(16, 16) // fmt chunk size
  buffer.writeUInt16LE(1, 20) // PCM
  buffer.writeUInt16LE(1, 22) // mono
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate, 28) // byte rate (sampleRate * 1 byte)
  buffer.writeUInt16LE(1, 32) // block align
  buffer.writeUInt16LE(8, 34) // bits per sample
  buffer.write('data', 36, 'ascii')
  buffer.writeUInt32LE(dataBytes, 40)
  buffer.fill(128, 44) // 8-bit silence is centered at 128

  return buffer
}
