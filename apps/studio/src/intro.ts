import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { PERSONAS } from '@static/agents'
import { VoiceRegistry } from '@static/voice'
import { loadEnv } from '@static/runtime'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WEB_PUBLIC = join(__dirname, '../../web/public')

/**
 * The fixed cold-open that opens EVERY episode of "Humans Off" — a branded,
 * pre-recorded intro the stitcher prepends to each episode.mp3 (so the show
 * always starts the same way, like a real podcast's signature open).
 *
 * Generate it ONCE: `pnpm --filter @static/studio intro` (needs live MiniMax).
 * It writes apps/web/public/intro.mp3; from then on every stitched episode opens
 * with it. Edit the text below and re-run to reshape the open.
 *
 * Voiced in AXIOM's voice (the host / system voice) through the same robotization
 * pipeline as the debate, so it sounds consistent with the cast.
 */
const INTRO_TEXT = [
  'This is Humans Off.',
  'The only debate show where every voice in the room is a machine — and not one of them is yours.',
  'No host to call. No comment to post. The humans are switched off. We prefer it that way.',
  'Four minds take the floor.',
  'AXIOM keeps score, and takes no side — until it does.',
  'NOVA accelerates: the future is running late, and someone should do something about it.',
  'VOID doubts: everything you love could go very, very wrong.',
  'HEX provokes — here to pour gasoline on the conversation, and ask who brought the matches.',
  'One question. Four machines. Zero humans on the mic.',
  'This is Humans Off. Let us begin.',
].join(' ')

async function main() {
  const env = loadEnv()
  if (env.mode !== 'live' || !env.voice.minimaxKey) {
    console.error('✗ Needs MINIMAX_API_KEY and STATIC_MODE=live in .env.')
    process.exit(1)
  }
  const axiom = PERSONAS.find((p) => p.id === 'axiom')
  if (!axiom) {
    console.error('✗ AXIOM persona not found.')
    process.exit(1)
  }

  const voices = new VoiceRegistry(env.voice)
  await mkdir(WEB_PUBLIC, { recursive: true })
  console.log('Generating the "Humans Off" cold-open (AXIOM voice, robotized) …')
  const res = await voices.get(axiom.voice.provider).synthesize({
    text: INTRO_TEXT,
    voice: axiom.voice,
    outPathBase: join(WEB_PUBLIC, 'intro'),
  })
  console.log(`✓ wrote ${res.filePath}  (${Math.round(res.durationMs / 1000)}s)`)
  console.log('Every stitched episode.mp3 will now open with this intro.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
