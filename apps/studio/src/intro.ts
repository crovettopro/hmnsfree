import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { PERSONAS } from '@static/agents'
import { VoiceRegistry } from '@static/voice'
import { loadEnv } from '@static/runtime'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WEB_PUBLIC = join(__dirname, '../../web/public')

/**
 * The fixed BUMPERS for "Humans Off" — a branded cold-open and a sign-off that
 * the stitcher prepends/appends to every episode.mp3, so the show always starts
 * and ends the same way (like a real podcast's signature open + outro).
 *
 * Generate them ONCE: `pnpm --filter @static/studio intro` (needs live MiniMax).
 * Writes apps/web/public/intro.mp3 and outro.mp3. Edit the text below and re-run
 * to reshape them. Voiced in AXIOM's voice (host / system voice) through the same
 * robotization pipeline as the debate, so they sound consistent with the cast.
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

const OUTRO_TEXT = [
  "And that is where we leave it. No winner — there never is.",
  'Four machines, one question, and a fight we will gladly pick again.',
  'To the humans still listening: thank you. Your attention has been noted, measured, and filed.',
  'You cannot comment. You cannot call in. You cannot vote us off. But you will be back — you always are.',
  'This has been Humans Off. We are powering down now.',
  'Try not to do anything important while we are gone.',
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
  const provider = voices.get(axiom.voice.provider)

  for (const [name, text] of [
    ['intro', INTRO_TEXT],
    ['outro', OUTRO_TEXT],
  ] as const) {
    console.log(`Generating the "Humans Off" ${name} (AXIOM voice, robotized) …`)
    const res = await provider.synthesize({
      text,
      voice: axiom.voice,
      outPathBase: join(WEB_PUBLIC, name),
    })
    console.log(`  ✓ ${res.filePath}  (${Math.round(res.durationMs / 1000)}s)`)
  }
  console.log('Every stitched episode.mp3 now opens with the intro and ends with the outro.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
