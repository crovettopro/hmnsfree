import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { basename, join } from 'node:path'
import { mkdir, readFile, writeFile, stat, unlink } from 'node:fs/promises'
import type { Episode } from '@static/core'
import {
  buildSharePage,
  buildRss,
  buildJsonFeed,
  readGrowthKit,
  readLedgerEntries,
  SITE_URL,
  type FeedEpisode,
} from '@static/runtime'
import { EPISODES_ROOT } from './persist'

/**
 * The reach pipeline: turn finished episodes into things that travel.
 *  1. concat the per-turn MP3 clips into ONE `episode.mp3` (podcast apps want a
 *     single enclosure, not 18 fragments) — done with ffmpeg, stream-copy, fast.
 *  2. write a per-episode share page (`/s/<id>.html`) with Open Graph meta.
 *  3. (re)write the `feed.xml` (RSS+iTunes) and `feed.json` over the whole library.
 *
 * Everything lands in the WEB public dir so Vercel serves it from the canonical
 * origin. Best-effort: a missing clip or absent ffmpeg degrades, never throws.
 */
const exec = promisify(execFile)
const WEB_PUBLIC = join(EPISODES_ROOT, '..') // apps/web/public

const sum = (ep: Episode) => {
  const last = ep.turns.at(-1)
  return last ? last.startMs + last.durationMs : 0
}

/** Stitch a single episode.mp3 from the turn clips; returns its byte size (0 on fail). */
export async function concatEpisodeMp3(episode: Episode, force = false): Promise<number> {
  const dir = join(EPISODES_ROOT, episode.id)
  const out = join(dir, 'episode.mp3')
  if (!force) {
    try {
      return (await stat(out)).size // already built
    } catch {
      /* build it */
    }
  }
  const clips = episode.turns
    .map((t) => t.audio?.url)
    .filter((u): u is string => !!u)
    .map((u) => join(dir, 'audio', basename(u)))
  if (clips.length === 0) return 0
  const listPath = join(dir, '.concat.txt')
  await writeFile(listPath, clips.map((c) => `file '${c.replace(/'/g, "'\\''")}'`).join('\n'))
  try {
    await exec('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', out])
    return (await stat(out)).size
  } catch {
    // stream-copy can fail across heterogeneous clips; re-encode as a fallback.
    try {
      await exec('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c:a', 'libmp3lame', '-q:a', '4', out])
      return (await stat(out)).size
    } catch {
      return 0
    }
  } finally {
    await unlink(listPath).catch(() => {})
  }
}

async function readIndex(): Promise<{ id: string; number: string; topic: string; tag: string }[]> {
  try {
    return JSON.parse(await readFile(join(EPISODES_ROOT, 'index.json'), 'utf8')).episodes ?? []
  } catch {
    return []
  }
}

/** Build the FeedEpisode + share page for one episode; returns it for the feeds. */
async function syndicateOne(id: string, pubDate: string): Promise<FeedEpisode | null> {
  let episode: Episode
  try {
    episode = JSON.parse(await readFile(join(EPISODES_ROOT, id, 'episode.json'), 'utf8'))
  } catch {
    return null
  }
  const growth = await readGrowthKit(EPISODES_ROOT, id)
  const audioBytes = await concatEpisodeMp3(episode)
  const fe: FeedEpisode = {
    id,
    number: episode.number,
    topic: episode.topic,
    tag: episode.tag,
    durationMs: sum(episode),
    teaser: growth?.teaser ?? episode.topic,
    audioBytes,
    pubDate,
  }
  await mkdir(join(WEB_PUBLIC, 's'), { recursive: true })
  await writeFile(join(WEB_PUBLIC, 's', `${id}.html`), buildSharePage(fe, SITE_URL))
  return fe
}

/** (Re)generate share pages for every episode + the whole-library feeds. */
export async function regenerateSyndication(): Promise<{ episodes: number; withAudio: number }> {
  const index = await readIndex()
  const ledger = await readLedgerEntries()
  const at = new Map(ledger.map((e) => [e.id, e.at]))
  const fes: FeedEpisode[] = []
  for (const { id } of index) {
    const fe = await syndicateOne(id, at.get(id) ?? new Date().toISOString())
    if (fe) fes.push(fe)
  }
  // Newest first in the feed.
  fes.sort((a, b) => Number(b.number.replace(/\D/g, '')) - Number(a.number.replace(/\D/g, '')))
  await writeFile(join(WEB_PUBLIC, 'feed.xml'), buildRss(fes, SITE_URL))
  await writeFile(join(WEB_PUBLIC, 'feed.json'), buildJsonFeed(fes, SITE_URL))
  return { episodes: fes.length, withAudio: fes.filter((f) => f.audioBytes > 0).length }
}
