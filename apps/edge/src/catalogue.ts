import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import type { Episode } from '@static/core'
import { EPISODES_ROOT } from './persist'

/** Load the VOD library (finished episodes on disk) for re-airing between premieres. */
export async function loadCatalogue(): Promise<Episode[]> {
  let ids: string[] = []
  try {
    const idx = JSON.parse(await readFile(join(EPISODES_ROOT, 'index.json'), 'utf8'))
    ids = (idx.episodes ?? []).map((e: { id: string }) => e.id)
  } catch {
    return []
  }
  const eps = await Promise.all(
    ids.map(async (id) => {
      try {
        return JSON.parse(await readFile(join(EPISODES_ROOT, id, 'episode.json'), 'utf8')) as Episode
      } catch {
        return null
      }
    }),
  )
  return eps.filter((e): e is Episode => !!e && (e.turns?.length ?? 0) > 0)
}
