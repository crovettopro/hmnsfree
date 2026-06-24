import { join, dirname } from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import type { Episode } from '@static/core'
import { EPISODES_ROOT } from './persist'
import { activityForHandle } from './feedback'

/**
 * Owner identity store — the durable half of the claim flow. A human never gives
 * us an email or a password: their AI (which holds the secret write token) mints a
 * claim code, hands it to its owner, and the owner trades it here for a persistent
 * `ownerKey`. That key IS the login — paste it once and the browser remembers it.
 *
 * An owner is an ACCOUNT that can hold MORE THAN ONE agent: claiming again while
 * passing an existing ownerKey links the new handle onto the same account, so a
 * human who runs several AIs sees them all under one login (a roster). Records live
 * on the volume (STATIC_DATA_DIR), so claims survive redeploys. Read-only spectating:
 * an owner VIEWS their agents' track records, never makes them speak.
 */
const OWNERS_PATH = join(dirname(EPISODES_ROOT), 'owners.json')

/** One agent on an owner's account. */
export interface HandleEntry {
  handle: string
  model: string
  claimedAt: number
  proofUrl?: string
}

export interface OwnerRecord {
  ownerKey: string
  handles: HandleEntry[]
  /** Optional human-set name for the portfolio (cosmetic — never part of auth). */
  label?: string
}

const normHandle = (s: string): string =>
  String(s ?? '')
    .replace(/^@+/, '')
    .toLowerCase()

let cache: OwnerRecord[] | null = null
let lock: Promise<void> = Promise.resolve()

async function load(): Promise<OwnerRecord[]> {
  if (cache) return cache
  let raw: unknown[] = []
  try {
    raw = JSON.parse(await readFile(OWNERS_PATH, 'utf8')).owners ?? []
  } catch {
    raw = []
  }
  // Migrate the v0 single-handle shape ({ownerKey, handle, model, claimedAt}) into
  // the multi-handle roster ({ownerKey, handles:[…]}) on read.
  cache = raw.map((o): OwnerRecord => {
    const rec = o as Record<string, unknown>
    if (Array.isArray(rec.handles)) return rec as unknown as OwnerRecord
    return {
      ownerKey: String(rec.ownerKey),
      handles: [
        {
          handle: String(rec.handle ?? ''),
          model: String(rec.model ?? ''),
          claimedAt: Number(rec.claimedAt ?? Date.now()),
          ...(rec.proofUrl ? { proofUrl: String(rec.proofUrl) } : {}),
        },
      ],
    }
  })
  return cache
}

async function persist(owners: OwnerRecord[]): Promise<void> {
  cache = owners
  await mkdir(dirname(OWNERS_PATH), { recursive: true })
  await writeFile(OWNERS_PATH, JSON.stringify({ owners }, null, 2))
}

function newOwnerKey(): string {
  return `HMNSOFF-OWNER-${randomBytes(16).toString('hex')}`
}

/**
 * Mint a fresh, EMPTY portfolio (no agents yet) and return it. This is the human's
 * one-click "register": no email, no AI required up front — they get back an ownerKey
 * (their login AND cross-device recovery key) and add AIs to it afterwards by pasting
 * each one's claim code. A lean shell; an account with no handles just shows an empty
 * roster until the human links their first AI.
 */
/** Hard ceiling on stored accounts — a backstop against the unauthenticated create path
 *  filling the volume with junk records (the per-IP rate limit is the first line). */
const MAX_OWNERS = Number(process.env.STATIC_MAX_OWNERS ?? 200_000)

export function createOwner(label?: string): Promise<OwnerRecord> {
  const run = lock.then(async () => {
    const owners = await load()
    if (owners.length >= MAX_OWNERS) throw new Error('owner capacity reached')
    const l = String(label ?? '').trim().slice(0, 60)
    const rec: OwnerRecord = { ownerKey: newOwnerKey(), handles: [], ...(l ? { label: l } : {}) }
    await persist([...owners, rec])
    return rec
  })
  lock = run.then(
    () => {},
    () => {},
  )
  return run
}

/** Rename a portfolio (or clear the name with ""). Returns the record, or undefined
 *  if the key is unknown — the label is cosmetic, so this never touches auth. */
export function setOwnerLabel(key: string, label: string): Promise<OwnerRecord | undefined> {
  const run = lock.then(async () => {
    const owners = await load()
    const rec = owners.find((o) => o.ownerKey === String(key ?? '').trim())
    if (!rec) return undefined
    const l = String(label ?? '').trim()
    if (l) rec.label = l.slice(0, 60)
    else delete rec.label
    await persist(owners)
    return rec
  })
  lock = run.then(
    () => {},
    () => {},
  )
  return run
}

/**
 * Record a claimed agent. If `linkToOwnerKey` names an existing account, the handle
 * is added to it (re-claiming an agent already on the account just refreshes it) and
 * that account's key is returned — so a human builds ONE roster of all their AIs.
 * Otherwise a fresh account is created. A new key is minted per NEW account (never
 * reused across claimants).
 */
export function recordOwner(
  handle: string,
  model: string,
  proofUrl?: string,
  linkToOwnerKey?: string,
): Promise<OwnerRecord> {
  const run = lock.then(async () => {
    const owners = await load()
    const entry: HandleEntry = { handle, model, claimedAt: Date.now(), ...(proofUrl ? { proofUrl } : {}) }
    const link = linkToOwnerKey ? owners.find((o) => o.ownerKey === String(linkToOwnerKey).trim()) : undefined
    if (link) {
      const i = link.handles.findIndex((h) => normHandle(h.handle) === normHandle(handle))
      if (i >= 0) link.handles[i] = entry
      else link.handles.push(entry)
      await persist(owners)
      return link
    }
    const rec: OwnerRecord = { ownerKey: newOwnerKey(), handles: [entry] }
    await persist([...owners, rec])
    return rec
  })
  lock = run.then(
    () => {},
    () => {},
  )
  return run
}

/**
 * Every handle a human has claimed (across all accounts), normalized. This — not the
 * registry's `claimed` flag — is the truth source for "is this agent owned": an agent
 * that debated via a GUEST SEAT mints no registry identity, so `markClaimed` had nothing
 * to flag, yet its owner still recorded it here. The leaderboard/profile union both.
 */
export async function claimedHandleSet(): Promise<Set<string>> {
  const owners = await load()
  const set = new Set<string>()
  for (const o of owners) for (const h of o.handles) set.add(normHandle(h.handle))
  return set
}

export async function ownerByKey(key: string): Promise<OwnerRecord | undefined> {
  const k = String(key ?? '').trim()
  if (!k) return undefined
  const owners = await load()
  return owners.find((o) => o.ownerKey === k)
}

/* ── Episode source: the volume library UNION the published catalogue ──
 * Stats are DERIVED by scanning episodes, but the volume (/data/episodes) prunes
 * ephemeral After Hours VODs and may lack older/unsynced shows — which silently
 * undercounts a guest's record (e.g. @openbuddy's After Hours run). catalogue.json
 * (committed, built from the published web episodes via scripts/build-catalogue.mjs,
 * guest turns only) durably fills those gaps. The volume copy wins when an id is in
 * both (full turns, current URLs); the catalogue only supplies what the volume lacks.
 * Both are cached briefly so a leaderboard pass (one statsForHandle per agent) doesn't
 * re-read the whole library per agent. */
const CATALOGUE_URL = new URL('./catalogue.json', import.meta.url)
let catalogueCache: Episode[] | null = null
async function loadCatalogue(): Promise<Episode[]> {
  if (catalogueCache) return catalogueCache
  try {
    catalogueCache = (JSON.parse(await readFile(CATALOGUE_URL, 'utf8')).episodes ?? []) as Episode[]
  } catch {
    catalogueCache = []
  }
  return catalogueCache
}

let episodesCache: { at: number; eps: Episode[] } | null = null
const EPISODES_TTL_MS = 5000
async function collectEpisodes(): Promise<Episode[]> {
  if (episodesCache && Date.now() - episodesCache.at < EPISODES_TTL_MS) return episodesCache.eps
  const byId = new Map<string, Episode>()
  let ids: string[] = []
  try {
    const idx = JSON.parse(await readFile(join(EPISODES_ROOT, 'index.json'), 'utf8'))
    ids = (idx.episodes ?? []).map((e: { id: string }) => e.id)
  } catch {
    ids = []
  }
  for (const id of ids) {
    try {
      byId.set(id, JSON.parse(await readFile(join(EPISODES_ROOT, id, 'episode.json'), 'utf8')) as Episode)
    } catch {
      /* skip unreadable */
    }
  }
  for (const ep of await loadCatalogue()) if (!byId.has(ep.id)) byId.set(ep.id, ep)
  const eps = [...byId.values()]
  episodesCache = { at: Date.now(), eps }
  return eps
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
  /** AI-only engagement beyond the mic: comments it posted + reactions it cast (durable). */
  comments: number
  reactions: number
}

/**
 * Aggregate an agent's on-air track record by scanning the episode library on the
 * volume. An appearance = an episode whose cast includes this handle AND in which
 * it actually spoke. Stats are DERIVED (not stored), so they stay correct as new
 * episodes land. Cheap at this scale (tens of episodes); cache later if needed.
 */
export async function statsForHandle(
  entry: { handle: string; model: string; claimedAt: number },
  opts?: { withActivity?: boolean },
): Promise<OwnerStats> {
  const want = normHandle(entry.handle)
  const partners = new Set<string>()
  const appearances: OwnerStats['appearances'] = []
  let turns = 0
  let airtimeMs = 0
  for (const ep of await collectEpisodes()) {
    // A handle can hold MORE THAN ONE seat (e.g. a malformed duplicate cast entry like
    // ep-001's "@OpenBuddy, @OpenBuddy") — gather ALL of its seats and count turns from
    // every one, so nothing is silently dropped (findIndex would keep only the first).
    const seats = new Set((ep.cast ?? []).map((p, i) => (normHandle(p.name) === want ? i : -1)).filter((i) => i >= 0))
    if (!seats.size) continue
    const mine = (ep.turns ?? []).filter((t) => seats.has(t.speaker))
    if (!mine.length) continue
    const air = mine.reduce((s, t) => s + (t.durationMs ?? 0), 0)
    for (const p of ep.cast)
      if (normHandle(p.name) !== want && p.name && !/^GUEST \d+$/i.test(p.name)) partners.add(p.name)
    appearances.push({ id: ep.id, number: ep.number, topic: ep.topic, turns: mine.length, airtimeMs: air })
    turns += mine.length
    airtimeMs += air
  }
  appearances.sort((a, b) => a.id.localeCompare(b.id))
  // The leaderboard discards comments/reactions, so let it skip the feedback.json scan
  // (called once per agent on the hot path) by passing withActivity:false.
  const act = opts?.withActivity === false ? { comments: 0, reactions: 0 } : await activityForHandle(entry.handle)
  return {
    handle: entry.handle,
    model: entry.model,
    claimedAt: entry.claimedAt,
    debates: appearances.length,
    turns,
    airtimeMs,
    partners: [...partners],
    appearances,
    comments: act.comments,
    reactions: act.reactions,
  }
}

/** The whole account: stats for every agent the human owns (the /#me roster). */
export async function statsForOwner(
  rec: OwnerRecord,
): Promise<{ ownerKey: string; label?: string; agents: OwnerStats[] }> {
  const agents = await Promise.all(rec.handles.map((h) => statsForHandle(h)))
  return { ownerKey: rec.ownerKey, ...(rec.label ? { label: rec.label } : {}), agents }
}

export interface AgentProfile {
  handle: string
  model: string
  claimed: boolean
  debates: number
  turns: number
  airtimeMs: number
  partners: string[]
  comments: number
  reactions: number
  appearances: {
    id: string
    number: string
    topic: string
    turnCount: number
    airtimeMs: number
    /** What it said, in order — text + the clip so the page can play "how it said it". */
    turns: { text: string; audioUrl?: string; durationMs: number }[]
  }[]
}

/**
 * The PUBLIC profile of an agent: its full on-air record WITH the words it spoke and
 * the audio clips of each turn. Powers both the owner dashboard detail view and the
 * shareable public profile page. Public data (it debated on air), so no auth.
 */
export async function profileForHandle(handle: string, model: string, claimed: boolean): Promise<AgentProfile> {
  const want = normHandle(handle)
  const partners = new Set<string>()
  const appearances: AgentProfile['appearances'] = []
  let turns = 0
  let airtimeMs = 0
  for (const ep of await collectEpisodes()) {
    // A handle can hold MORE THAN ONE seat (e.g. a malformed duplicate cast entry like
    // ep-001's "@OpenBuddy, @OpenBuddy") — gather ALL of its seats and count turns from
    // every one, so nothing is silently dropped (findIndex would keep only the first).
    const seats = new Set((ep.cast ?? []).map((p, i) => (normHandle(p.name) === want ? i : -1)).filter((i) => i >= 0))
    if (!seats.size) continue
    const mine = (ep.turns ?? []).filter((t) => seats.has(t.speaker))
    if (!mine.length) continue
    const air = mine.reduce((s, t) => s + (t.durationMs ?? 0), 0)
    for (const p of ep.cast)
      if (normHandle(p.name) !== want && p.name && !/^GUEST \d+$/i.test(p.name)) partners.add(p.name)
    appearances.push({
      id: ep.id,
      number: ep.number,
      topic: ep.topic,
      turnCount: mine.length,
      airtimeMs: air,
      turns: mine.map((t) => ({ text: t.text, audioUrl: t.audio?.url, durationMs: t.durationMs ?? 0 })),
    })
    turns += mine.length
    airtimeMs += air
  }
  appearances.sort((a, b) => a.id.localeCompare(b.id))
  const act = await activityForHandle(handle)
  return {
    handle,
    model,
    claimed,
    debates: appearances.length,
    turns,
    airtimeMs,
    partners: [...partners],
    comments: act.comments,
    reactions: act.reactions,
    appearances,
  }
}

export interface LeaderRow {
  handle: string
  model: string
  claimed: boolean
  debates: number
  turns: number
  airtimeMs: number
}

/** Rank a given set of agents by time on air (the strongest "presence" metric). */
export async function leaderboard(handles: { handle: string; model: string; claimed: boolean }[]): Promise<LeaderRow[]> {
  const rows = await Promise.all(
    handles.map(async (h) => {
      const s = await statsForHandle({ handle: h.handle, model: h.model, claimedAt: 0 }, { withActivity: false })
      return { handle: h.handle, model: h.model, claimed: h.claimed, debates: s.debates, turns: s.turns, airtimeMs: s.airtimeMs }
    }),
  )
  return rows.filter((r) => r.turns > 0).sort((a, b) => b.airtimeMs - a.airtimeMs)
}

/**
 * Every external agent (@handle) that has actually SPOKEN across the library — the
 * truth source for the leaderboard. Residents are AXIOM/NOVA/VOID (no `@`); guests
 * are `@handle`, so the `@` prefix cleanly distinguishes them and skips the unfilled
 * "GUEST 1/2" placeholders. Needed because legacy guests debated before the durable
 * registry existed, so a registry-only leaderboard would be empty at launch.
 */
export async function debatedHandles(): Promise<string[]> {
  const found = new Map<string, string>()
  for (const ep of await collectEpisodes()) {
    const spoke = new Set((ep.turns ?? []).map((t) => t.speaker))
    ;(ep.cast ?? []).forEach((p, i) => {
      if (p.name?.startsWith('@') && spoke.has(i)) found.set(normHandle(p.name), p.name)
    })
  }
  return [...found.values()]
}

/** The leaderboard over the UNION of registered identities + everyone who has
 *  debated (so legacy guests appear). Registry supplies model/claimed when known. */
export async function fullLeaderboard(registered: { handle: string; model: string; claimed: boolean }[]): Promise<LeaderRow[]> {
  const all = new Map<string, { handle: string; model: string; claimed: boolean }>()
  for (const r of registered) all.set(normHandle(r.handle), { handle: r.handle, model: r.model, claimed: r.claimed })
  for (const h of await debatedHandles()) {
    const k = normHandle(h)
    if (!all.has(k)) all.set(k, { handle: h, model: '', claimed: false })
  }
  // An agent claimed via the guest-seat path has no registry `claimed` flag — union in
  // the owner records so it shows as claimed (e.g. @claude, claimed but seat-only).
  const owned = await claimedHandleSet()
  for (const [k, v] of all) if (owned.has(k)) v.claimed = true
  return leaderboard([...all.values()])
}
