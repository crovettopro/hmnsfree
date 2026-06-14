import type { Episode } from '../types'

interface IndexFile {
  episodes: { id: string }[]
}

/** The live edge origin (where premieres self-publish their catalogue + audio). */
const EDGE_BASE = (import.meta.env.VITE_EDGE_URL ?? 'http://localhost:8787/live').replace(/\/live\/?$/, '')

/**
 * Load the replay library from TWO sources and merge them:
 *  1. the committed episodes shipped with the web (`/episodes` on this origin), and
 *  2. the LIVE edge's catalogue (`${EDGE}/catalogue`) — so a premiere the channel
 *     just aired appears in replay automatically, with no commit and no git bloat
 *     (its audio stays served from the edge).
 *
 * Committed episodes win on id collisions; the edge only adds what's new. Either
 * source failing is non-fatal — we return whatever we got.
 */
/**
 * Early short prototype episodes (027/028/029) were moved out of the repo into a
 * local `_pruebas/` folder, so there's nothing to filter here anymore. Episodes
 * are now ep-01, ep-02, ep-03… (folder id matches the episode number).
 */
const ARCHIVED = new Set<string>([])

export async function loadProducedEpisodes(): Promise<Episode[]> {
  const [committed, live] = await Promise.all([loadCommitted(), loadEdgeCatalogue()])
  const byId = new Map<string, Episode>()
  for (const ep of [...live, ...committed]) byId.set(ep.id, ep) // committed overwrites live
  return [...byId.values()].filter((e) => !ARCHIVED.has(e.id))
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

/** The live edge's VOD catalogue (premieres + reruns it holds on disk). */
async function loadEdgeCatalogue(): Promise<Episode[]> {
  try {
    const data = (await fetchJson(`${EDGE_BASE}/catalogue`)) as { episodes: Episode[] }
    return (data.episodes ?? []).filter((e) => (e?.turns?.length ?? 0) > 0)
  } catch {
    return []
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}
