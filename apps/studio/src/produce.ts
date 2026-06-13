import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import type { Episode } from '@static/core'
import { fmtTime } from '@static/core'
import { episodeCast } from '@static/agents'
import type { DebateEvent } from '@static/protocol'
import {
  loadEnv,
  produceEpisode,
  type ProduceUsage,
  analyzeQuality,
  reportQuality,
  appendLedger,
  plannedFor,
} from '@static/runtime'

const __dirname = dirname(fileURLToPath(import.meta.url))
const EPISODES_ROOT = join(__dirname, '../../web/public/episodes')
const INDEX_PATH = join(EPISODES_ROOT, 'index.json')

interface EpisodeSummary {
  id: string
  number: string
  topic: string
  tag: string
  listeners: string
}

async function readIndex(): Promise<EpisodeSummary[]> {
  try {
    return JSON.parse(await readFile(INDEX_PATH, 'utf8')).episodes ?? []
  } catch {
    return []
  }
}

/** Load a produced episode's saved JSON (for --resume). Null if absent. */
async function loadEpisode(id: string): Promise<Episode | undefined> {
  try {
    return JSON.parse(await readFile(join(EPISODES_ROOT, id, 'episode.json'), 'utf8'))
  } catch {
    return undefined
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function logEvent(e: DebateEvent) {
  switch (e.type) {
    case 'episode.scheduled':
      console.log(`\n🎙  ${e.episode.number} — "${e.episode.topic}"  [${e.episode.tag}]`)
      break
    case 'turn.opened':
      process.stdout.write(`  ${String(e.speaker)} ${e.directiveKind.padEnd(8)} `)
      break
    case 'turn.text': {
      const short = e.text.length > 80 ? e.text.slice(0, 77) + '…' : e.text
      process.stdout.write(`“${short}”`)
      break
    }
    case 'turn.audio':
      console.log(`  (${fmtTime(e.durationMs)})`)
      break
    case 'episode.ended':
      console.log(`\n✓ episode assembled — total ${fmtTime(e.totalMs)}`)
      break
    case 'error':
      console.error(`✗ [${e.scope}] ${e.message}`)
      break
  }
}

async function main() {
  const env = loadEnv()
  const existing = await readIndex()

  // Resume a partial that hit the wall: continue the SAME episode id/number/audio.
  const resumeId = arg('resume')
  const resumeFrom = resumeId ? await loadEpisode(resumeId) : undefined
  if (resumeId && !resumeFrom) {
    console.error(`✗ Cannot resume "${resumeId}" — no episode.json found.`)
    process.exit(1)
  }

  const baseWeek = 27 // produced episodes continue after the 3 hand-authored seeds
  const week = Number(arg('week') ?? baseWeek + existing.length)
  const number = resumeFrom ? resumeFrom.number.replace(/^EP\./, '') : arg('number') ?? String(week)
  const id = resumeFrom ? resumeFrom.id : `ep-${number.padStart(3, '0')}`

  // Editorial calendar: use the programmed topic + briefing for --date (default
  // today). Falls back to autonomous selection when nothing's scheduled.
  const planned = resumeFrom ? undefined : plannedFor(arg('date') ?? new Date().toISOString().slice(0, 10))

  console.log(`STATIC studio — mode: ${env.mode.toUpperCase()}${env.mode === 'mock' ? ' (no API keys; deterministic)' : ''}`)
  if (resumeFrom) {
    console.log(`↻ Resuming ${resumeFrom.number} from ${resumeFrom.turns.length} saved turns.`)
  } else if (planned) {
    console.log(`🗓  Programmed topic: "${planned.topic}" (${planned.briefing?.length ?? 0} briefing points)`)
  } else {
    console.log(`🎲 No scheduled topic — the show will pick its own.`)
  }

  // Checkpoint: keep a live reference to the (in-place mutated) episode so we can
  // flush it to disk after EVERY committed turn. If a long run hits the quota wall
  // mid-way, we keep every produced turn and the web can still play the partial —
  // and we learn exactly how far we got. Essential for the "find our limits" test.
  let liveEpisode: Episode | undefined
  let committed = 0
  const checkpoint = (e: DebateEvent) => {
    if (e.type === 'episode.scheduled') liveEpisode = e.episode
    if (e.type === 'turn.closed' && liveEpisode) {
      committed++
      // Fire-and-forget; a later flush supersedes an earlier one (same paths).
      void writeEpisode(liveEpisode).catch(() => {})
    }
  }

  // Rotate the 2 debaters by episode number: AXIOM + a different pair each show.
  // Keyed on the number (stable across --resume) so a resumed partial gets the
  // SAME cast and speaker indices still line up.
  const { cast, moderator } = episodeCast(Number(number))
  console.log(`🎙  Cast: ${cast.map((c) => c.name).join(' · ')} (AXIOM moderates)`)

  const audioDir = join(EPISODES_ROOT, id, 'audio')
  try {
    const { episode, usage } = await produceEpisode({
      env,
      personas: cast,
      moderator,
      week,
      number,
      audioDir,
      audioUrlBase: `/episodes/${id}/audio`,
      recentTopics: existing.slice(-5).map((e) => e.topic),
      minTurns: arg('min') ? Number(arg('min')) : undefined,
      maxTurns: arg('max') ? Number(arg('max')) : undefined,
      resumeFrom,
      planned,
      onEvent: (e) => {
        logEvent(e)
        checkpoint(e)
      },
    })

    await writeEpisode(episode)
    console.log(`\nWrote ${join('apps/web/public/episodes', id, 'episode.json')}`)
    reportUsage(episode, usage)
    reportQuality(analyzeQuality(episode))
    await appendLedger(episode, usage, false, new Date().toISOString(), !!resumeFrom)
    console.log(`\nOpen the web app and it will appear in the episode list.\n`)
  } catch (err) {
    // Hit the wall (quota/rate limit) or some other failure mid-run. The
    // checkpoint already saved every committed turn — report where we stopped.
    const turns = liveEpisode?.turns ?? []
    if (liveEpisode && turns.length) {
      await writeEpisode(liveEpisode)
      const mins = (turns[turns.length - 1].startMs + turns[turns.length - 1].durationMs) / 60000
      console.error(
        `\n⚠ Run stopped early after ${committed} turns (~${mins.toFixed(1)} min, ` +
          `~${committed * 2 + 1} requests). Partial episode SAVED — the web can play it.\n` +
          `  Limit reached at: ${err instanceof Error ? err.message : String(err)}\n`,
      )
      reportQuality(analyzeQuality(liveEpisode)) // analyze what we did produce
      // Record the partial run too — the limits test cares exactly about this.
      const last = turns[turns.length - 1]
      await appendLedger(
        liveEpisode,
        {
          llmCalls: committed + 1, // + topic selection
          ttsCalls: committed,
          ttsCharacters: turns.reduce((s, t) => s + t.text.length, 0),
          totalMs: last ? last.startMs + last.durationMs : 0,
        },
        true,
        new Date().toISOString(),
      )
      process.exit(0) // partial success: we kept everything we produced
    }
    throw err
  }
}

/** Spend report — measure every run so we can project cost before going live. */
function reportUsage(episode: Episode, usage: ProduceUsage) {
  const mins = (usage.totalMs / 60000).toFixed(1)
  console.log(
    `\n── usage ─────────────────────────────\n` +
      `  audio:          ${mins} min (${episode.turns.length} turns)\n` +
      `  LLM calls:      ${usage.llmCalls}  (topic + director + turns)\n` +
      `  TTS calls:      ${usage.ttsCalls}\n` +
      `  TTS characters: ${usage.ttsCharacters.toLocaleString()}\n` +
      `  ~per audio-min: ${Math.round(usage.ttsCharacters / Math.max(1, usage.totalMs / 60000)).toLocaleString()} chars, ` +
      `${(usage.llmCalls / Math.max(1, usage.totalMs / 60000)).toFixed(1)} LLM calls\n` +
      `──────────────────────────────────────`,
  )
}

async function writeEpisode(episode: Episode) {
  const dir = join(EPISODES_ROOT, episode.id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'episode.json'), JSON.stringify(episode, null, 2))

  const index = await readIndex()
  const summary: EpisodeSummary = {
    id: episode.id,
    number: episode.number,
    topic: episode.topic,
    tag: episode.tag,
    listeners: episode.listeners,
  }
  const next = [...index.filter((e) => e.id !== episode.id), summary]
  await mkdir(EPISODES_ROOT, { recursive: true })
  await writeFile(INDEX_PATH, JSON.stringify({ episodes: next }, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
