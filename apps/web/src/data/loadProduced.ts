import type { Episode } from '../types'

interface IndexFile {
  episodes: { id: string }[]
}

/** The live edge that produces + serves premieres (their audio lives on its volume). */
const EDGE_BASE = 'https://static-production-a1e5.up.railway.app'

/**
 * Live premieres we've REVIEWED and chosen to publish as permanent replay episodes.
 * The edge airs many shows (autonomous premieres, reruns, ignites) — but ONLY the ids
 * listed here surface in the archive, so nothing the edge produces auto-leaks into the
 * curated library. This is the allowlist gate the manual curation asked for: a premiere
 * becomes a permanent episode the moment (and only when) we add its id below.
 *
 * Optional `blurb`/`cover` override the (often empty) fields on the live VOD json.
 *
 * Currently EMPTY ON PURPOSE: live premieres will get their own dedicated "Lives"
 * section rather than being mixed into the studio archive (decided 2026-06-14). The
 * first real premiere, ep-033 ("the kind lie"), is reviewed but held back — strong
 * first half, but the back half circles/repeats below the studio bar. It stays on the
 * edge volume; to surface a premiere here later, add its id (+ optional blurb/cover).
 */
const PUBLISHED_PREMIERES: Record<string, { blurb?: string; cover?: string }> = {}

/**
 * The replay library = the episodes we ship with the web (`/episodes/index.json`) PLUS
 * any live premieres we've explicitly published (`PUBLISHED_PREMIERES`). A premiere is a
 * real-time moment, not repeatable catalogue, so it never appears here automatically —
 * only when we add its id to the allowlist. The edge is queried per-id (not its full
 * catalogue), so reruns/autonomous shows can never bleed in.
 */
export async function loadProducedEpisodes(): Promise<Episode[]> {
  const [committed, premieres] = await Promise.all([loadCommitted(), loadPublishedPremieres()])
  // Committed wins on id collision; otherwise keep both. Order doesn't matter — every
  // consumer sorts by episode number.
  const byId = new Map<string, Episode>()
  for (const e of [...committed, ...premieres]) if (!byId.has(e.id)) byId.set(e.id, e)
  return [...byId.values()]
}

/** Episodes bundled with this deploy (written by the studio pipeline). */
async function loadCommitted(): Promise<Episode[]> {
  try {
    const idx = (await fetchJson('/episodes/index.json')) as IndexFile
    const ids = idx.episodes?.map((e) => e.id) ?? []
    const episodes = await Promise.all(
      ids.map((id) => fetchJson(`/episodes/${id}/episode.json`).catch(() => null)),
    )
    return episodes.filter(Boolean) as Episode[]
  } catch {
    return []
  }
}

/**
 * Pull each allowlisted premiere straight from the edge (its audio urls are already
 * absolute, so they stream from the edge volume — no rewrite, no git bloat). If the edge
 * is down or an id 404s, that premiere is simply skipped; the committed library always
 * shows regardless.
 */
async function loadPublishedPremieres(): Promise<Episode[]> {
  const ids = Object.keys(PUBLISHED_PREMIERES)
  if (ids.length === 0) return []
  const loaded = await Promise.all(
    ids.map((id) =>
      fetchJson(`${EDGE_BASE}/episodes/${id}/episode.json`)
        .then((e) => enrich(e as Episode, id))
        .catch(() => null),
    ),
  )
  return loaded.filter(Boolean) as Episode[]
}

/** Apply our blurb/cover overrides to a live VOD that often ships those fields empty. */
function enrich(episode: Episode, id: string): Episode {
  const over = PUBLISHED_PREMIERES[id] ?? {}
  return { ...episode, blurb: episode.blurb ?? over.blurb, cover: episode.cover ?? over.cover }
}

/**
 * Recorded LIVE SHOWS — past premieres we've curated into a permanent archive,
 * committed under `/lives` (small json in git; their audio streams from the edge
 * volume via absolute urls, so no git bloat). Kept SEPARATE from the studio library:
 * the studio grid + landing show only `loadProducedEpisodes()`, while the Lives
 * section and the player's deep-link resolver pull these in.
 */
export async function loadLiveShows(): Promise<Episode[]> {
  try {
    const idx = (await fetchJson('/lives/index.json')) as { shows?: { id: string }[] }
    const ids = idx.shows?.map((s) => s.id) ?? []
    const shows = await Promise.all(
      ids.map((id) => fetchJson(`/lives/${id}/episode.json`).catch(() => null)),
    )
    return shows.filter(Boolean) as Episode[]
  } catch {
    return []
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}
