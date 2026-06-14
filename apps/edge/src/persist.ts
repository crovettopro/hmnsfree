import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdir, readFile, writeFile, cp, access, readdir, stat, rm } from 'node:fs/promises'
import type { Episode } from '@static/core'

/**
 * VOD for free: a live episode IS an Episode being built turn by turn, so we just
 * checkpoint it to the web's public dir as it grows. When the stream ends, that
 * same episode.json + audio clips are the replay — no separate recording step.
 *
 * Two writes, deliberately split: the per-turn checkpoint touches ONLY this
 * episode's episode.json (cheap, conflict-free), while the shared index.json is
 * updated rarely and through a mutex — concurrent read-modify-write on the index
 * is what corrupted it before.
 */
const __dirname = dirname(fileURLToPath(import.meta.url))
// Where produced episodes live. Default = the web's public dir (bundled in the
// image). Point STATIC_DATA_DIR at a mounted persistent volume on the host so
// live premieres survive redeploys instead of vanishing with the ephemeral disk.
export const EPISODES_ROOT = process.env.STATIC_DATA_DIR
  ? join(process.env.STATIC_DATA_DIR, 'episodes')
  : join(__dirname, '../../web/public/episodes')
const INDEX_PATH = join(EPISODES_ROOT, 'index.json')

interface EpisodeSummary {
  id: string
  number: string
  topic: string
  tag: string
  listeners: string
}

/**
 * First-boot seeding for a persistent volume. When STATIC_DATA_DIR points at a
 * fresh (empty) volume, copy the episodes bundled in the image into it so the
 * catalogue/reruns aren't empty until the first premiere. No-op without a volume
 * or once the volume already has an index.
 */
export async function ensureDataDir(): Promise<void> {
  if (!process.env.STATIC_DATA_DIR) return
  try {
    await access(INDEX_PATH)
    return // already seeded
  } catch {
    /* seed below */
  }
  const bundled = join(dirname(fileURLToPath(import.meta.url)), '../../web/public/episodes')
  if (bundled === EPISODES_ROOT) return
  try {
    await mkdir(EPISODES_ROOT, { recursive: true })
    await cp(bundled, EPISODES_ROOT, { recursive: true })
    console.log(`seeded data dir from bundled episodes → ${EPISODES_ROOT}`)
  } catch (err) {
    console.warn('data-dir seed skipped:', err instanceof Error ? err.message : err)
  }
}

/**
 * Audio retention. Ephemeral rooms (After Hours `c2-*`, ignites `ig-*`) write a full
 * episode's audio (~100-150MB) to the volume on every show but are NEVER part of the
 * library — with reruns off, that audio is dead weight the moment the show ends. This
 * deletes those dirs once they're older than the retention window so the volume (and
 * Railway storage cost) doesn't grow without bound. The flagship `ep-*` library is the
 * record of truth and is left untouched.
 */
const EPHEMERAL_DIR_RE = /^(c2|ig)-/
export async function pruneEphemeral(): Promise<void> {
  const maxAgeMs = Number(process.env.STATIC_AUDIO_RETENTION_HOURS ?? 12) * 3_600_000
  let entries: import('node:fs').Dirent[]
  try {
    entries = await readdir(EPISODES_ROOT, { withFileTypes: true })
  } catch {
    return
  }
  const now = Date.now()
  let removed = 0
  for (const e of entries) {
    if (!e.isDirectory() || !EPHEMERAL_DIR_RE.test(e.name)) continue
    const dir = join(EPISODES_ROOT, e.name)
    try {
      const s = await stat(dir)
      if (now - s.mtimeMs > maxAgeMs) {
        await rm(dir, { recursive: true, force: true })
        removed++
      }
    } catch {
      /* ignore a dir that vanished or can't be read */
    }
  }
  if (removed) console.log(`audio retention: pruned ${removed} ephemeral dir(s) > ${maxAgeMs / 3_600_000}h old`)
}

/** Per-turn checkpoint: write just this episode's JSON. Safe to call often. */
export async function checkpointEpisode(episode: Episode): Promise<void> {
  const dir = join(EPISODES_ROOT, episode.id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'episode.json'), JSON.stringify(episode, null, 2))
}

// Serialize all index writes so concurrent updates can't clobber the file.
let indexLock: Promise<void> = Promise.resolve()

/** Add/refresh this episode in the library index (mutex-guarded). */
export function upsertIndex(episode: Episode): Promise<void> {
  const run = indexLock.then(async () => {
    let index: EpisodeSummary[] = []
    try {
      index = JSON.parse(await readFile(INDEX_PATH, 'utf8')).episodes ?? []
    } catch {
      index = []
    }
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
  })
  // Keep the chain alive even if one write fails.
  indexLock = run.catch(() => {})
  return run
}
