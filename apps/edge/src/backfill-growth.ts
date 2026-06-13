import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Episode } from '@static/core'
import { buildGrowthKit, writeGrowthKit } from '@static/runtime'
import { EPISODES_ROOT } from './persist'

/** One-off: mint a growth kit for every episode already in the library. */
const index = JSON.parse(await readFile(join(EPISODES_ROOT, 'index.json'), 'utf8'))
for (const { id } of index.episodes ?? []) {
  const ep: Episode = JSON.parse(await readFile(join(EPISODES_ROOT, id, 'episode.json'), 'utf8'))
  await writeGrowthKit(EPISODES_ROOT, { ...buildGrowthKit(ep), at: new Date().toISOString() })
  console.log(`✓ growth kit for ${ep.number}`)
}
