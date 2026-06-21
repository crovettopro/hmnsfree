import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { PERSONAS } from '@static/agents'
import { VoiceRegistry } from '@static/voice'
import { loadEnv } from '@static/runtime'

/**
 * RE-VOICE a VOD whose audio was lost (folder reuse on the live volume overwrote
 * it) but whose transcript survived in the published episode.json. Reads the
 * source transcript, re-synthesizes every turn through the SAME robotized MiniMax
 * pipeline as a live premiere, and writes a fresh web episode.json + audio clips
 * to a staging dir for upload to the CDN volume.
 *
 * Usage (from repo root):
 *   pnpm --filter @static/studio exec tsx src/revoice.ts <srcId> <outId> [limit]
 *   e.g. tsx src/revoice.ts ep-037 ep-05-vod         (full)
 *        tsx src/revoice.ts ep-037 ep-05-vod 2       (smoke: first 2 turns)
 *
 * Audio clips land in apps/studio/.revoice/<outId>/audio/ — tar that into the
 * volume at /data/episodes/<outId>/audio, then the episode.json (written to the
 * web lives dir) serves them from cdn.hmnsoff.com/episodes/<outId>/audio.
 */
const __dirname = dirname(fileURLToPath(import.meta.url))
const WEB_LIVES = join(__dirname, '../../web/public/lives')
const STAGING = join(__dirname, '../.revoice')
const CDN = 'https://cdn.hmnsoff.com'
const GAP_MS = 360 // INTER_TURN_GAP_MS — must match the live engine so timelines align

async function main() {
  const [srcId, outId, limitArg] = process.argv.slice(2)
  if (!srcId || !outId) {
    console.error('Usage: tsx src/revoice.ts <srcId> <outId> [limit]')
    process.exit(1)
  }
  const limit = limitArg ? Number(limitArg) : Infinity

  const env = loadEnv()
  if (env.mode !== 'live' || !env.voice.minimaxKey) {
    console.error('✗ Needs MINIMAX_API_KEY and STATIC_MODE=live in .env.')
    process.exit(1)
  }

  const src = JSON.parse(await readFile(join(WEB_LIVES, srcId, 'episode.json'), 'utf8'))
  const srcCast: { id: string; name: string }[] = src.cast ?? []
  const turnsIn: { speaker: number; text: string }[] = src.turns ?? []
  console.log(`Source ${srcId}: "${src.topic}" — ${turnsIn.length} turns, cast [${srcCast.map((c) => c.name).join(', ')}]`)

  const voices = new VoiceRegistry(env.voice)
  const audioDir = join(STAGING, outId, 'audio')
  await mkdir(audioDir, { recursive: true })

  const speakersUsed = new Set<number>()
  const turnsOut: unknown[] = []
  let cursor = 0
  const n = Math.min(turnsIn.length, limit)
  for (let i = 0; i < n; i++) {
    const t = turnsIn[i]
    speakersUsed.add(t.speaker)
    const castEntry = srcCast[t.speaker]
    const persona = PERSONAS.find((p) => p.id === castEntry?.id)
    if (!persona) throw new Error(`No persona for speaker ${t.speaker} (${castEntry?.id})`)

    const base = `t${String(i).padStart(2, '0')}-${persona.id}`
    const res = await voices.get(persona.voice.provider).synthesize({
      text: t.text,
      voice: persona.voice,
      outPathBase: join(audioDir, base),
    })
    const clipMs = res.durationMs
    const slotMs = Math.round(clipMs + GAP_MS)
    turnsOut.push({
      id: `${outId}-t${String(i).padStart(2, '0')}`,
      speaker: t.speaker,
      text: t.text,
      startMs: cursor,
      durationMs: slotMs,
      audio: {
        url: `${CDN}/episodes/${outId}/audio/${base}.mp3`,
        format: res.format ?? 'audio/mpeg',
        durationMs: clipMs,
        wordTimings: res.wordTimings ?? [],
      },
    })
    cursor += slotMs
    console.log(`  ✓ t${i} ${persona.name}  ${Math.round(clipMs / 1000)}s`)
  }

  // Keep only cast members that actually spoke (drop unused guest placeholders).
  const cast = srcCast.filter((_c, i) => speakersUsed.has(i))
  const episode = {
    id: outId,
    number: src.number ?? '',
    tag: 'MAIN STAGE · LIVE',
    topic: src.topic,
    listeners: src.listeners ?? '13.8K',
    cast,
    turns: turnsOut,
    status: 'published',
    blurb: src.blurb ?? '',
  }
  const outDir = join(WEB_LIVES, outId)
  await mkdir(outDir, { recursive: true })
  await writeFile(join(outDir, 'episode.json'), JSON.stringify(episode, null, 1))
  console.log(`\nWROTE ${join(outDir, 'episode.json')} — ${turnsOut.length} turns, ${(cursor / 60000).toFixed(1)} min`)
  console.log(`Audio clips staged in ${audioDir}`)
  console.log(`Upload: tar czf - -C ${join(STAGING, outId, '..')} ${outId}/audio | railway ssh "tar xzf - -C /data/episodes"`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
