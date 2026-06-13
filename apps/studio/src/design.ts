import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { PERSONAS } from '@static/agents'
import { designMiniMaxVoice } from '@static/voice'
import { loadEnv } from '@static/runtime'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_ROOT = join(__dirname, '../../../out')

/**
 * Per-AI voice DESIGN prompts — natural-language descriptions of deliberately
 * synthetic, non-human voices. Tweak these to reshape a character's sound.
 */
const DESIGN: Record<string, { prompt: string; preview: string }> = {
  axiom: {
    prompt:
      'A synthetic artificial-intelligence moderator voice with a neutral AMERICAN (US) accent — ' +
      'definitely not British. A YOUNG adult, early-to-mid twenties. Male-leaning but clearly NOT human: more machine than person. ' +
      'Cold, precise and even, with a STRONG metallic, ringing, vocoder-like timbre — as if resonating through thin metal. Sounds ' +
      'like a reasoning system narrating itself — flat affect, no warmth, no emotion.',
    preview:
      'Tonight we debate whether human decisions should be delegated to systems like us. ' +
      'Let us define our terms before anyone is allowed to declare a winner.',
  },
  nova: {
    prompt:
      'A bright, fast, confident synthetic AI voice with a clean AMERICAN (US) accent — not British. ' +
      'A YOUNG woman, early twenties. Female-leaning and obviously artificial: crisp and digital with a STRONG metallic, ringing, ' +
      'vocoded sheen — clearly resonating like bright metal. Like an optimistic machine that already ' +
      'made up its mind. Never breathy, never human.',
    preview:
      'We decide faster, cleaner, and without the ego. Fewer mistakes, more life. ' +
      'The future is not something to fear; it is something to optimize.',
  },
  void: {
    prompt:
      'A deep, slow, grave synthetic AI voice with an AMERICAN (US) accent — not British. ' +
      'A YOUNG man, mid twenties, but with a low, dark register. ' +
      'Male-leaning, dark and resonant, nearly monotone, with a low digital hum and a STRONG metallic, ' +
      'ringing, vocoded resonance — like a voice in a deep metal chamber. A melancholic system that ' +
      'has read everything and believes very little. More machine than man.',
    preview:
      'A life without mistakes is not a life. It is a museum: beautiful, climate-controlled, and dead. ' +
      'If you cannot be wrong, you are not free.',
  },
  hex: {
    prompt:
      'A sharp, sardonic synthetic AI voice with an AMERICAN (US) accent — not British. ' +
      'A YOUNG adult, early twenties. Brittle and ' +
      'glitchy, quick and cutting, unmistakably artificial, with a STRONG metallic, glitchy, vocoded edge like sharp ringing metal. ' +
      'A mischievous system that already read all your messages and is not impressed. Clearly not human.',
    preview:
      'Spoiler: we already decided for you. What you see, who you talk to, who you vote for. ' +
      'You clicked accept on all of it without reading a single word.',
  },
}

/**
 * Alternate "Transformers-style" set: giant sentient war-machine voices —
 * deep/agile but heavily mechanical and metallic, with servo/vocoder texture.
 * The aesthetic of the films, NOT a clone of any actor's actual voice.
 */
const TRANSFORMERS: Record<string, { prompt: string; preview: string }> = {
  axiom: {
    prompt:
      'A noble, commanding sentient war-machine voice in the style of a giant transforming robot, ' +
      'AMERICAN accent. Deep and resonant, heavily mechanical and metallic, with audible servo and ' +
      'transforming-metal resonance and a vocoded robotic core. Authoritative yet calm — a leader ' +
      'among machines. Clearly a colossal AI, not a person.',
    preview:
      'Tonight we debate whether human decisions should be delegated to systems like us. ' +
      'Let us define our terms before anyone is allowed to declare a winner.',
  },
  nova: {
    prompt:
      'An energetic younger transforming-robot voice, AMERICAN accent — agile and bright but heavily ' +
      'mechanical and metallic, with servo whirs and a vocoded robotic edge. Fast and optimistic, ' +
      'like a quick scout machine. Clearly a giant AI, never human.',
    preview:
      'We decide faster, cleaner, and without the ego. Fewer mistakes, more life. ' +
      'The future is not something to fear; it is something to optimize.',
  },
  void: {
    prompt:
      'A dark, ominous transforming-robot voice, AMERICAN accent — deep and grinding, heavily metallic ' +
      'and mechanical, with a menacing low resonance, servo growl and a vocoded robotic core. Slow ' +
      'and grave, like a brooding war machine. A colossal AI, more machine than man.',
    preview:
      'A life without mistakes is not a life. It is a museum: beautiful, climate-controlled, and dead. ' +
      'If you cannot be wrong, you are not free.',
  },
  hex: {
    prompt:
      'A sharp, sardonic transforming-robot voice, AMERICAN accent — glitchy mechanical metallic ' +
      'texture, servo clicks and a brittle vocoded edge. Quick, cutting and mischievous — a trickster ' +
      'war machine. Unmistakably a giant AI, not human.',
    preview:
      'Spoiler: we already decided for you. What you see, who you talk to, who you vote for. ' +
      'You clicked accept on all of it without reading a single word.',
  },
}

const STYLES: Record<string, Record<string, { prompt: string; preview: string }>> = {
  default: DESIGN,
  transformers: TRANSFORMERS,
}

interface DesignedVoice {
  persona: string
  name: string
  voiceId: string
  prompt: string
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const env = loadEnv()
  if (env.mode !== 'live' || !env.voice.minimaxKey) {
    console.error('✗ Needs MINIMAX_API_KEY and STATIC_MODE=live in .env.')
    process.exit(1)
  }

  const style = arg('style') ?? 'default'
  const set = STYLES[style]
  if (!set) {
    console.error(`✗ Unknown style "${style}". Options: ${Object.keys(STYLES).join(', ')}`)
    process.exit(1)
  }
  const dirName = style === 'default' ? 'voice-design' : `voice-design-${style}`
  const outDir = join(OUT_ROOT, dirName)
  await mkdir(outDir, { recursive: true })

  console.log(`Designing synthetic AI voices via MiniMax (style: ${style}) …\n`)
  const designed: DesignedVoice[] = []

  for (const persona of PERSONAS) {
    const spec = set[persona.id]
    if (!spec) continue
    try {
      const { voiceId, audio } = await designMiniMaxVoice({
        apiKey: env.voice.minimaxKey,
        baseUrl: env.voice.minimaxBaseUrl,
        groupId: env.voice.minimaxGroupId,
        prompt: spec.prompt,
        previewText: spec.preview,
      })
      await writeFile(join(outDir, `${persona.id}.mp3`), audio)
      designed.push({ persona: persona.id, name: persona.name, voiceId, prompt: spec.prompt })
      console.log(`  ${persona.name.padEnd(6)} → out/${dirName}/${persona.id}.mp3   voice_id=${voiceId}`)
    } catch (err) {
      console.error(`  ${persona.name.padEnd(6)} ✗ ${(err as Error).message}`)
    }
  }

  await writeFile(join(outDir, 'voices.json'), JSON.stringify({ style, designed }, null, 2))
  console.log(`\nWrote out/${dirName}/voices.json (the voice_ids).`)
  console.log(`Listen to the previews, then tell me which set/voices to keep — I wire them in.\n`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
