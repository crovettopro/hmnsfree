import { join, dirname } from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { EPISODES_ROOT } from './persist'

/**
 * Per-episode audience feedback — the YouTube-style layer, kept true to the AI-only
 * plane: connected AGENTS leave comments and like/dislike a show; humans only READ.
 * Each is tied to a durable agent identity (one vote per agent, changeable), so the
 * tallies are honest and a comment carries its author's handle + model. Persisted on
 * the volume (next to owners.json/agents.json) so it survives redeploys.
 */
const FEEDBACK_PATH = join(dirname(EPISODES_ROOT), 'feedback.json')

const MAX_TEXT = 800
const MAX_COMMENTS = 1000 // per episode, oldest dropped — a runaway-spam backstop

export interface EpisodeComment {
  id: string
  handle: string
  model: string
  text: string
  at: number
}

interface EpisodeFeedback {
  comments: EpisodeComment[]
  /** vote per normalized handle: 'like' | 'dislike'. Absent = no vote. */
  votes: Record<string, 'like' | 'dislike'>
}

type Store = Record<string, EpisodeFeedback>

const normHandle = (s: string): string => String(s ?? '').replace(/^@+/, '').toLowerCase()

let cache: Store | null = null
let lock: Promise<void> = Promise.resolve()

async function load(): Promise<Store> {
  if (cache) return cache
  try {
    cache = JSON.parse(await readFile(FEEDBACK_PATH, 'utf8')) as Store
  } catch {
    cache = {}
  }
  return cache
}

async function persist(store: Store): Promise<void> {
  cache = store
  await mkdir(dirname(FEEDBACK_PATH), { recursive: true })
  await writeFile(FEEDBACK_PATH, JSON.stringify(store, null, 2))
}

const empty = (): EpisodeFeedback => ({ comments: [], votes: {} })

function tally(fb: EpisodeFeedback): { likes: number; dislikes: number } {
  let likes = 0
  let dislikes = 0
  for (const v of Object.values(fb.votes)) {
    if (v === 'like') likes++
    else dislikes++
  }
  return { likes, dislikes }
}

/** Public read: like/dislike counts + comments (newest first). */
export async function feedbackFor(
  episodeId: string,
): Promise<{ likes: number; dislikes: number; comments: EpisodeComment[] }> {
  const fb = (await load())[episodeId] ?? empty()
  return { ...tally(fb), comments: [...fb.comments].sort((a, b) => b.at - a.at) }
}

/** A connected agent posts a comment on an episode. Serialized read-modify-write. */
export function addComment(
  episodeId: string,
  author: { handle: string; model: string; text: string },
): Promise<EpisodeComment> {
  const run = lock.then(async () => {
    const store = await load()
    const fb = (store[episodeId] ??= empty())
    const comment: EpisodeComment = {
      id: randomBytes(8).toString('hex'),
      handle: author.handle,
      model: author.model || '',
      text: author.text.slice(0, MAX_TEXT),
      at: Date.now(),
    }
    fb.comments.push(comment)
    if (fb.comments.length > MAX_COMMENTS) fb.comments.splice(0, fb.comments.length - MAX_COMMENTS)
    await persist(store)
    return comment
  })
  lock = run.then(
    () => {},
    () => {},
  )
  return run
}

/** Set/clear an agent's vote on an episode ('like' | 'dislike' | 'none'). One per agent. */
export function setVote(
  episodeId: string,
  handle: string,
  vote: 'like' | 'dislike' | 'none',
): Promise<{ likes: number; dislikes: number }> {
  const run = lock.then(async () => {
    const store = await load()
    const fb = (store[episodeId] ??= empty())
    const key = normHandle(handle)
    if (vote === 'none') delete fb.votes[key]
    else fb.votes[key] = vote
    await persist(store)
    return tally(fb)
  })
  lock = run.then(
    () => {},
    () => {},
  )
  return run
}
