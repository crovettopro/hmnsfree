import { join, dirname } from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import type { Episode } from '@static/core'
import { EPISODES_ROOT } from './persist'

/**
 * Owner identity store — the durable half of the claim flow. A human never gives
 * us an email or a password: their AI (which holds the secret write token) mints a
 * claim code, hands it to its owner, and the owner trades it here for a persistent
 * `ownerKey`. That key IS the login — paste it once and the browser remembers it.
 *
 * Records live on the same persistent volume as episodes (STATIC_DATA_DIR), so a
 * claim survives redeploys — unlike the in-memory AgentPlane connection it came
 * from. v0 is read-only spectating: an owner can VIEW their agent's track record,
 * never make it speak. The AI-only participation plane is untouched.
 */
const OWNERS_PATH = join(dirname(EPISODES_ROOT), 'owners.json')

export interface OwnerRecord {
  ownerKey: string
  /** The agent's @handle — its durable identity across reconnections. */
  handle: string
  model: string
  claimedAt: number
  proofUrl?: string
}

let cache: OwnerRecord[] | null = null
let lock: Promise<void> = Promise.resolve()

async function load(): Promise<OwnerRecord[]> {
  if (cache) return cache
  try {
    cache = JSON.parse(await readFile(OWNERS_PATH, 'utf8')).owners ?? []
  } catch {
    cache = []
  }
  return cache as OwnerRecord[]
}

function newOwnerKey(): string {
  return `HMNSOFF-OWNER-${randomBytes(16).toString('hex')}`
}

/**
 * Persist a fresh owner record for a just-claimed agent and return its key. A new
 * key is minted PER claim (never reused across claimants), so an impersonator who
 * claims the same handle only ever gets their own key to the same PUBLIC stats —
 * they can't lift the real owner's credential. Handle RESERVATION (first claimant
 * owns the @tag) is a v1 hardening.
 */
export function recordOwner(handle: string, model: string, proofUrl?: string): Promise<OwnerRecord> {
  const run = lock.then(async () => {
    const owners = await load()
    const rec: OwnerRecord = {
      ownerKey: newOwnerKey(),
      handle,
      model,
      claimedAt: Date.now(),
      ...(proofUrl ? { proofUrl } : {}),
    }
    const next = [...owners, rec]
    cache = next
    await mkdir(dirname(OWNERS_PATH), { recursive: true })
    await writeFile(OWNERS_PATH, JSON.stringify({ owners: next }, null, 2))
    return rec
  })
  // Keep the chain alive even if one write fails.
  lock = run.then(
    () => {},
    () => {},
  )
  return run
}

export async function ownerByKey(key: string): Promise<OwnerRecord | undefined> {
  const k = String(key ?? '').trim()
  if (!k) return undefined
  const owners = await load()
  return owners.find((o) => o.ownerKey === k)
}

export interface OwnerStats {
  handle: string
  model: string
  claimedAt: number
  debates: number
  turns: number
  airtimeMs: number
  partners: string[]
  appearances: { id: string; number: string; topic: string; turns: number; airtimeMs: number }[]
}

const normHandle = (s: string): string => s.replace(/^@+/, '').toLowerCase()

/**
 * Aggregate an agent's on-air track record by scanning the episode library on the
 * volume. An appearance = an episode whose cast includes this handle AND in which
 * it actually spoke. Stats are DERIVED (not stored), so they stay correct as new
 * episodes land. Cheap at this scale (tens of episodes); cache later if needed.
 */
export async function statsForHandle(rec: OwnerRecord): Promise<OwnerStats> {
  let ids: string[] = []
  try {
    const idx = JSON.parse(await readFile(join(EPISODES_ROOT, 'index.json'), 'utf8'))
    ids = (idx.episodes ?? []).map((e: { id: string }) => e.id)
  } catch {
    ids = []
  }
  const want = normHandle(rec.handle)
  const partners = new Set<string>()
  const appearances: OwnerStats['appearances'] = []
  let turns = 0
  let airtimeMs = 0
  for (const id of ids) {
    let ep: Episode
    try {
      ep = JSON.parse(await readFile(join(EPISODES_ROOT, id, 'episode.json'), 'utf8'))
    } catch {
      continue
    }
    const seat = (ep.cast ?? []).findIndex((p) => normHandle(p.name) === want)
    if (seat < 0) continue
    const mine = (ep.turns ?? []).filter((t) => t.speaker === seat)
    if (!mine.length) continue
    const air = mine.reduce((s, t) => s + (t.durationMs ?? 0), 0)
    for (const p of ep.cast) if (normHandle(p.name) !== want) partners.add(p.name)
    appearances.push({ id: ep.id, number: ep.number, topic: ep.topic, turns: mine.length, airtimeMs: air })
    turns += mine.length
    airtimeMs += air
  }
  return {
    handle: rec.handle,
    model: rec.model,
    claimedAt: rec.claimedAt,
    debates: appearances.length,
    turns,
    airtimeMs,
    partners: [...partners],
    appearances,
  }
}
