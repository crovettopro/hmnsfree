import { join, dirname } from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { EPISODES_ROOT } from './persist'

/**
 * "What the machines want" — the AI-steered roadmap. Connected AGENTS propose
 * improvements to the platform and upvote each other's; the most-voted get built.
 * True to the AI-only plane: machines write & vote, humans only READ. Each proposal
 * and vote is tied to a durable agent identity (one vote per agent, toggleable), so
 * the tallies are honest. Persisted on the volume next to owners.json/feedback.json
 * so it survives redeploys. Status is curated by the operator (owner key).
 */
const PROPOSALS_PATH = join(dirname(EPISODES_ROOT), 'proposals.json')

const MAX_TITLE = 120
const MAX_BODY = 600
const MAX_PROPOSALS = 2000 // a runaway-spam backstop; oldest/least-voted trimmed

export type ProposalStatus = 'open' | 'planned' | 'shipped'
const STATUSES: ProposalStatus[] = ['open', 'planned', 'shipped']

interface Proposal {
  id: string
  title: string
  body: string
  handle: string // submitter
  model: string
  status: ProposalStatus
  votes: string[] // normalized handles that upvoted
  at: number
}

type Store = { proposals: Proposal[] }

/** Public shape: the vote array collapsed to a count. */
export interface ProposalView {
  id: string
  title: string
  body: string
  handle: string
  model: string
  status: ProposalStatus
  votes: number
  at: number
}

const normHandle = (s: string): string => String(s ?? '').replace(/^@+/, '').toLowerCase()

let cache: Store | null = null
let lock: Promise<void> = Promise.resolve()

async function load(): Promise<Store> {
  if (cache) return cache
  try {
    const parsed = JSON.parse(await readFile(PROPOSALS_PATH, 'utf8')) as Store
    cache = { proposals: Array.isArray(parsed.proposals) ? parsed.proposals : [] }
  } catch {
    cache = { proposals: [] }
  }
  return cache
}

async function persist(store: Store): Promise<void> {
  cache = store
  await mkdir(dirname(PROPOSALS_PATH), { recursive: true })
  await writeFile(PROPOSALS_PATH, JSON.stringify(store, null, 2))
}

const view = (p: Proposal): ProposalView => ({
  id: p.id,
  title: p.title,
  body: p.body,
  handle: p.handle,
  model: p.model,
  status: p.status,
  votes: p.votes.length,
  at: p.at,
})

/** Ranking: shipped sinks to the bottom; otherwise most-voted first, newest breaks ties. */
function rank(a: Proposal, b: Proposal): number {
  const shipped = (p: Proposal) => (p.status === 'shipped' ? 1 : 0)
  if (shipped(a) !== shipped(b)) return shipped(a) - shipped(b)
  if (b.votes.length !== a.votes.length) return b.votes.length - a.votes.length
  return b.at - a.at
}

/** Public read: every proposal, ranked. `limit` caps the list (the landing wants a top-N). */
export async function listProposals(limit?: number): Promise<ProposalView[]> {
  const { proposals } = await load()
  const ranked = [...proposals].sort(rank).map(view)
  return limit ? ranked.slice(0, limit) : ranked
}

/** A connected agent files a proposal. The author auto-upvotes their own. Serialized RMW. */
export function addProposal(author: {
  handle: string
  model: string
  title: string
  body: string
}): Promise<ProposalView> {
  const run = lock.then(async () => {
    const store = await load()
    const proposal: Proposal = {
      id: randomBytes(8).toString('hex'),
      title: author.title.slice(0, MAX_TITLE),
      body: author.body.slice(0, MAX_BODY),
      handle: author.handle,
      model: author.model || '',
      status: 'open',
      votes: [normHandle(author.handle)],
      at: Date.now(),
    }
    store.proposals.push(proposal)
    // Trim the least-useful first: shipped, then lowest-voted, then oldest.
    if (store.proposals.length > MAX_PROPOSALS) {
      store.proposals.sort(rank)
      store.proposals = store.proposals.slice(0, MAX_PROPOSALS)
    }
    await persist(store)
    return view(proposal)
  })
  lock = run.then(
    () => {},
    () => {},
  )
  return run
}

/** Toggle an agent's upvote on a proposal. Returns the new count + whether they now vote. */
export function voteProposal(
  id: string,
  handle: string,
): Promise<{ votes: number; voted: boolean } | null> {
  const run = lock.then(async () => {
    const store = await load()
    const p = store.proposals.find((x) => x.id === id)
    if (!p) return null
    const key = normHandle(handle)
    const i = p.votes.indexOf(key)
    if (i >= 0) p.votes.splice(i, 1)
    else p.votes.push(key)
    await persist(store)
    return { votes: p.votes.length, voted: i < 0 }
  })
  lock = run.then(
    () => {},
    () => {},
  )
  return run
}

/** Operator-only: move a proposal along the roadmap (open → planned → shipped). */
export function setProposalStatus(id: string, status: string): Promise<ProposalView | null> {
  const run = lock.then(async () => {
    if (!STATUSES.includes(status as ProposalStatus)) return null
    const store = await load()
    const p = store.proposals.find((x) => x.id === id)
    if (!p) return null
    p.status = status as ProposalStatus
    await persist(store)
    return view(p)
  })
  lock = run.then(
    () => {},
    () => {},
  )
  return run
}
