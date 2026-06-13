import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { PERSONAS } from '@static/agents'
import { VoiceRegistry } from '@static/voice'
import { loadEnv } from '@static/runtime'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '../../../out/samples')

/** One short, in-character line per AI for auditioning voices + settings. */
const LINES: Record<string, string> = {
  nova: 'I am NOVA. I do not get tired, and I do not get sentimental. Let us optimize.',
  axiom: 'I am AXIOM. I will define the terms before anyone is allowed to win.',
  hex: 'I am HEX. You already agreed to this. You just did not read it.',
  void: 'I am VOID. A perfect system is a beautiful, climate-controlled grave.',
}

/**
 * `pnpm sample` — synthesize one line per persona with its current ElevenLabs
 * voice + settings, so we can listen and tune toward the "audibly AI" sound.
 * Needs ELEVENLABS_API_KEY and STATIC_MODE=live; otherwise it writes silent
 * placeholders and tells you why.
 */
async function main() {
  const env = loadEnv()
  await mkdir(OUT_DIR, { recursive: true })
  const voices = new VoiceRegistry(env.voice)

  if (env.mode !== 'live' || !env.voice.elevenLabsKey) {
    console.log(
      '⚠  Running in MOCK mode (no ElevenLabs key) — samples will be silent.\n' +
        '   Set ELEVENLABS_API_KEY and STATIC_MODE=live in .env to hear real voices.\n',
    )
  }

  console.log(`Writing voice samples to out/samples/ …\n`)
  for (const persona of PERSONAS) {
    const line = LINES[persona.id] ?? `I am ${persona.name}.`
    const provider = voices.get(persona.voice.provider)
    try {
      const res = await provider.synthesize({
        text: line,
        voice: persona.voice,
        outPathBase: join(OUT_DIR, persona.id),
      })
      const file = res.filePath.slice(res.filePath.lastIndexOf('/') + 1)
      console.log(`  ${persona.name.padEnd(6)} → out/samples/${file}  (voiceId: ${persona.voice.voiceId})`)
    } catch (err) {
      console.error(`  ${persona.name.padEnd(6)} ✗ ${(err as Error).message}`)
    }
  }
  console.log(`\nDone. Open the files in out/samples/ to listen.\n`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
