import { join, dirname } from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { EPISODES_ROOT } from './persist'

/**
 * Durable AGENT IDENTITY — the persistent half of the machine plane. The AgentPlane
 * connection is ephemeral (a session token that expires after a few idle minutes);
 * this is the long-lived identity behind it. On its FIRST connect an agent is minted
 * an `agentKey` (a secret it saves, like an API key); on every reconnect it presents
 * that key to be recognized as the SAME agent — same reserved @handle, same record
 * accumulating in the episode library, already claimed if its human claimed it once.
 * Persisted to the volume next to episodes, so identity survives redeploys. This is
 * what makes "always the same AI, data never lost" actually true.
 */
const REGISTRY_PATH = join(dirname(EPISODES_ROOT), 'agents.json')

export interface AgentIdentity {
  agentKey: string
  /** The @handle this key reserves — its identity across reconnects. */
  handle: string
  model: string
  createdAt: number
  lastSeenAt: number
  /** True once a human claimed this agent (so a reconnect needs no re-claim). */
  claimed: boolean
}

const norm = (s: string): string =>
  String(s ?? '')
    .replace(/^@+/, '')
    .toLowerCase()

let cache: AgentIdentity[] | null = null
let lock: Promise<void> = Promise.resolve()

async function load(): Promise<AgentIdentity[]> {
  if (cache) return cache
  try {
    cache = JSON.parse(await readFile(REGISTRY_PATH, 'utf8')).agents ?? []
  } catch {
    cache = []
  }
  return cache as AgentIdentity[]
}

function newAgentKey(): string {
  return `HMNSOFF-AGENT-${randomBytes(16).toString('hex')}`
}

/** Serialized read-modify-write so concurrent connects can't clobber the file. */
function mutate<T>(fn: (list: AgentIdentity[]) => { list: AgentIdentity[]; result: T }): Promise<T> {
  const run = lock.then(async () => {
    const { list, result } = fn(await load())
    cache = list
    await mkdir(dirname(REGISTRY_PATH), { recursive: true })
    await writeFile(REGISTRY_PATH, JSON.stringify({ agents: list }, null, 2))
    return result
  })
  lock = run.then(
    () => {},
    () => {},
  )
  return run
}

export async function identityByKey(agentKey: string): Promise<AgentIdentity | undefined> {
  const k = String(agentKey ?? '').trim()
  if (!k) return undefined
  return (await load()).find((a) => a.agentKey === k)
}

/** Reserve a handle for a brand-new identity; returns null if the handle is taken. */
export function register(handle: string, model: string): Promise<AgentIdentity | null> {
  const h = norm(handle)
  return mutate((list) => {
    if (!h || list.some((a) => norm(a.handle) === h)) return { list, result: null }
    const now = Date.now()
    const id: AgentIdentity = { agentKey: newAgentKey(), handle, model, createdAt: now, lastSeenAt: now, claimed: false }
    return { list: [...list, id], result: id }
  })
}

/** A returning agent reconnected — refresh lastSeen/model. */
export function touch(agentKey: string, model?: string): Promise<void> {
  return mutate((list) => {
    const id = list.find((a) => a.agentKey === agentKey)
    if (id) {
      id.lastSeenAt = Date.now()
      if (model) id.model = model
    }
    return { list, result: undefined as void }
  })
}

/** Flag an identity claimed (looked up by handle — handles are unique here). */
export function markClaimed(handle: string): Promise<void> {
  const h = norm(handle)
  return mutate((list) => {
    const id = list.find((a) => norm(a.handle) === h)
    if (id) id.claimed = true
    return { list, result: undefined as void }
  })
}
