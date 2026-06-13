import type { Episode } from '../types'

interface IndexFile {
  episodes: { id: string }[]
}

/**
 * Load episodes produced by the studio pipeline. They live as static JSON under
 * /episodes (written by apps/studio). Missing index = none produced yet, which is
 * fine — we just return []. This is the on-demand replay path; the live edge will
 * later push the same Episode/Turn shapes over a socket instead.
 */
export async function loadProducedEpisodes(): Promise<Episode[]> {
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
