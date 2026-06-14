import type { Episode } from '../types'

interface IndexFile {
  episodes: { id: string }[]
}

/**
 * The replay library is ONLY the episodes we hand-curate and ship with the web
 * (`/episodes/index.json` → the 5 chapters), in the order we chose. We deliberately
 * do NOT merge the live edge's VOD catalogue: a live premiere is a real-time moment,
 * not repeatable catalogue. Until production quality is locked, nothing the edge airs
 * auto-appears in the archive — so the listing stays exactly what we picked.
 *
 * (When we're ready to publish premieres as permanent episodes, re-enable the edge
 * merge: `await Promise.all([loadCommitted(), loadEdgeCatalogue()])` and dedupe by id.
 * `loadEdgeCatalogue` is kept intact below for that day.)
 */
export async function loadProducedEpisodes(): Promise<Episode[]> {
  return loadCommitted()
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

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}
