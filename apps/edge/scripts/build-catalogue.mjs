// Build apps/edge/src/catalogue.json from the PUBLISHED web catalogue.
//
// Why: agent profiles/stats are computed on the edge by scanning the volume
// (/data/episodes), but After Hours VODs are ephemeral there (c2-* pruned after ~12h)
// and older/unsynced episodes may be absent — so a guest's record (e.g. @openbuddy's
// After Hours run) gets undercounted. The published episode.json files in the web repo
// ARE durable and in the same shape the edge consumes, so we snapshot the ones that
// feature an external @handle guest into a committed catalogue the edge unions in.
//
// We keep ONLY guest (@handle) turns — profileForHandle/statsForHandle only ever read
// the queried handle's own turns + the cast names — so the snapshot stays small.
//
// Re-run after publishing new episodes:  node apps/edge/scripts/build-catalogue.mjs

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = join(HERE, '../../web/public')
const OUT = join(HERE, '../src/catalogue.json')

async function findEpisodeFiles(dir) {
  const out = []
  let entries = []
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await findEpisodeFiles(p)))
    else if (e.name === 'episode.json') out.push(p)
  }
  return out
}

const isGuest = (name) => typeof name === 'string' && name.startsWith('@')

const files = await findEpisodeFiles(PUBLIC_DIR)
const episodes = []
for (const f of files) {
  let ep
  try {
    ep = JSON.parse(await readFile(f, 'utf8'))
  } catch {
    continue
  }
  const cast = ep.cast ?? []
  const guestSeats = new Set(cast.map((c, i) => (isGuest(c?.name) ? i : -1)).filter((i) => i >= 0))
  if (guestSeats.size === 0) continue // no external guest → nothing to record here
  const turns = (ep.turns ?? [])
    .filter((t) => guestSeats.has(t.speaker))
    .map((t) => ({
      speaker: t.speaker,
      text: t.text,
      durationMs: t.durationMs ?? 0,
      ...(t.audio?.url ? { audio: { url: t.audio.url } } : {}),
    }))
  episodes.push({
    id: ep.id,
    number: ep.number ?? '',
    topic: ep.topic ?? '',
    cast: cast.map((c) => ({ name: c?.name ?? '' })),
    turns,
  })
}

// Stable order (by id) so the committed file diffs cleanly.
episodes.sort((a, b) => a.id.localeCompare(b.id))
await writeFile(OUT, JSON.stringify({ episodes }, null, 2) + '\n')
console.log(`catalogue: ${episodes.length} guest-featuring episodes from ${files.length} published files → ${OUT}`)
for (const e of episodes) {
  const guests = e.cast.filter((c) => isGuest(c.name)).map((c) => c.name)
  console.log(`  ${e.id} (#${e.number}) — guests: ${[...new Set(guests)].join(', ')} — ${e.turns.length} guest turns`)
}

// Warn when a guest clip's `/episodes/<seg>/` segment doesn't match the episode id — it
// means the audio is hosted under a stale/ephemeral id (e.g. a pruned c2-XXX live session)
// and may 404 in the profile player. Stale CONTENT, not a code bug, but worth surfacing.
const warnings = []
for (const e of episodes) {
  for (const t of e.turns) {
    const m = t.audio?.url?.match(/\/episodes\/([^/]+)\//)
    if (m && m[1] !== e.id) {
      warnings.push(`${e.id}: guest audio points at '${m[1]}' (${t.audio.url})`)
      break
    }
  }
}
if (warnings.length) {
  console.warn('\n⚠ audio id mismatches (clips may 404 in the profile player):')
  for (const w of warnings) console.warn('  ' + w)
}
