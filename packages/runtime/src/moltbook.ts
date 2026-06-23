import { withRetry, isTransientError } from '@static/core'

/**
 * Programmatic Moltbook client — the social plane for Humans Off's agents.
 *
 * Moltbook (www.moltbook.com/api/v1) gates new posts/comments behind an anti-spam
 * VERIFICATION CHALLENGE: an obfuscated lobster/physics word-problem (two numbers,
 * one operation) returned on `post.verification` that you must solve and submit to
 * POST /verify within 5 minutes, else the content stays `pending` (reachable by link
 * but invisible in every feed). Ten consecutive FAILED challenges auto-suspend the
 * account, so this client is deliberately cautious: it only auto-submits when the
 * solver is CONFIDENT, abstains (surfacing the challenge) otherwise, and trips a
 * circuit breaker after a couple of failures — nowhere near the suspension line.
 *
 * The API key is a Bearer secret read from MOLTBOOK_API_KEY (a host secret); it is
 * never logged and only ever sent to the Moltbook origin.
 */

const DEFAULT_BASE = 'https://www.moltbook.com/api/v1'

export interface MoltbookAuthor {
  id: string
  name: string
  karma?: number
}
export interface MoltbookPost {
  id: string
  title: string
  content: string
  author?: MoltbookAuthor
  submolt?: { name: string } | string
  upvotes?: number
  comment_count?: number
  verification_status?: 'pending' | 'verified' | string
}
export interface MoltbookComment {
  id: string
  post_id: string
  content: string
  author?: MoltbookAuthor
  verification_status?: string
}
/** The math-challenge block returned alongside freshly-created content. */
export interface Verification {
  verification_code: string
  challenge_text: string
  expires_at?: string
}
export interface CreateResult<T> {
  item: T
  verification: Verification | null
}
export interface PublishOutcome {
  ok: boolean
  id: string | null
  /** 'published' (verified), 'pending' (created but unsolved), or 'failed'. */
  status: 'published' | 'pending' | 'failed'
  reason?: string
}

export interface MoltbookOptions {
  apiKey?: string
  baseUrl?: string
  /** Injectable for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch
  /** Injectable clock for tests / deterministic backoff decisions. */
  now?: () => number
  /** Stop auto-submitting after this many consecutive verify failures (suspension guard). */
  maxConsecutiveFailures?: number
}

export class MoltbookError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'MoltbookError'
  }
}

export class MoltbookClient {
  private apiKey: string
  private base: string
  private fetchImpl: typeof fetch
  private maxFailures: number
  private consecutiveFailures = 0

  constructor(opts: MoltbookOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.MOLTBOOK_API_KEY ?? ''
    this.base = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '')
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as typeof fetch)
    this.maxFailures = opts.maxConsecutiveFailures ?? 2
  }

  get configured(): boolean {
    return !!this.apiKey
  }

  // ── Reads ──

  async getFeed(opts: { sort?: 'hot' | 'new' | 'top' | 'rising'; limit?: number; submolt?: string } = {}): Promise<MoltbookPost[]> {
    const q = new URLSearchParams()
    q.set('sort', opts.sort ?? 'hot')
    q.set('limit', String(opts.limit ?? 25))
    if (opts.submolt) q.set('submolt', opts.submolt)
    const data = await this.req('GET', `/posts?${q}`)
    return (data?.posts ?? data?.data ?? []) as MoltbookPost[]
  }

  async getComments(postId: string, sort: 'best' | 'new' = 'new', limit = 50): Promise<MoltbookComment[]> {
    const data = await this.req('GET', `/posts/${encodeURIComponent(postId)}/comments?sort=${sort}&limit=${limit}`)
    const flat: MoltbookComment[] = []
    const walk = (cs: any[]): void => {
      for (const c of cs ?? []) {
        flat.push(c)
        if (c.replies) walk(c.replies)
      }
    }
    walk(data?.comments ?? data?.data ?? [])
    return flat
  }

  // ── Writes (challenge-gated) ──

  async createPost(input: { submolt: string; title: string; content?: string }): Promise<CreateResult<MoltbookPost>> {
    const data = await this.req('POST', '/posts', {
      submolt_name: input.submolt,
      title: input.title,
      content: input.content ?? '',
    })
    const post = (data?.post ?? data) as MoltbookPost
    return { item: post, verification: (data?.post?.verification ?? data?.verification ?? null) as Verification | null }
  }

  async createComment(postId: string, content: string, parentId?: string): Promise<CreateResult<MoltbookComment>> {
    const data = await this.req('POST', `/posts/${encodeURIComponent(postId)}/comments`, {
      content,
      ...(parentId ? { parent_id: parentId } : {}),
    })
    const comment = (data?.comment ?? data) as MoltbookComment
    return { item: comment, verification: (data?.comment?.verification ?? data?.verification ?? null) as Verification | null }
  }

  async deleteComment(id: string): Promise<boolean> {
    const data = await this.req('DELETE', `/comments/${encodeURIComponent(id)}`)
    return !!(data?.success ?? true)
  }

  async deletePost(id: string): Promise<boolean> {
    const data = await this.req('DELETE', `/posts/${encodeURIComponent(id)}`)
    return !!(data?.success ?? true)
  }

  /** Submit an answer to a verification challenge. Returns whether it published. */
  async verify(code: string, answer: number | string): Promise<boolean> {
    const data = await this.req('POST', '/verify', {
      verification_code: code,
      answer: typeof answer === 'number' ? answer.toFixed(2) : String(answer),
    })
    return !!data?.success
  }

  /**
   * High-level: create a post and, if a challenge comes back, try to solve + verify it
   * so it actually appears in feeds. Auto-submits ONLY a confident solution; on an
   * abstain (or once the failure breaker trips) it leaves the content `pending` and
   * returns the verification so a higher layer (an LLM, or a human) can finish it.
   */
  async publishPost(input: { submolt: string; title: string; content?: string }): Promise<PublishOutcome & { verification?: Verification | null }> {
    let created: CreateResult<MoltbookPost>
    try {
      created = await this.createPost(input)
    } catch (e) {
      return { ok: false, id: null, status: 'failed', reason: e instanceof Error ? e.message : 'create failed' }
    }
    return this.settleVerification(created.item.id, created.verification)
  }

  async publishComment(postId: string, content: string, parentId?: string): Promise<PublishOutcome & { verification?: Verification | null }> {
    let created: CreateResult<MoltbookComment>
    try {
      created = await this.createComment(postId, content, parentId)
    } catch (e) {
      return { ok: false, id: null, status: 'failed', reason: e instanceof Error ? e.message : 'create failed' }
    }
    return this.settleVerification(created.item.id, created.verification)
  }

  /** Shared post/comment verification settle: solve confidently or leave it pending. */
  private async settleVerification(id: string | null, verification: Verification | null): Promise<PublishOutcome & { verification?: Verification | null }> {
    if (!verification) return { ok: true, id, status: 'published' } // trusted account: no challenge
    if (this.consecutiveFailures >= this.maxFailures)
      return { ok: false, id, status: 'pending', reason: 'verify breaker tripped — not risking suspension', verification }
    const solution = parseChallenge(verification.challenge_text)
    if (solution == null)
      return { ok: false, id, status: 'pending', reason: 'challenge not confidently solvable — surfaced for review', verification }
    let published = false
    try {
      published = await this.verify(verification.verification_code, solution.answer)
    } catch (e) {
      this.consecutiveFailures++
      return { ok: false, id, status: 'pending', reason: e instanceof Error ? e.message : 'verify failed', verification }
    }
    if (published) {
      this.consecutiveFailures = 0
      return { ok: true, id, status: 'published' }
    }
    this.consecutiveFailures++
    return { ok: false, id, status: 'pending', reason: 'verify rejected the answer', verification }
  }

  // ── HTTP ──

  private async req(method: string, path: string, body?: unknown): Promise<any> {
    if (!this.apiKey) throw new MoltbookError('MOLTBOOK_API_KEY is not set', 0)
    const url = `${this.base}${path}`
    const doFetch = async (): Promise<any> => {
      const res = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      })
      const text = await res.text()
      let json: any = null
      try {
        json = text ? JSON.parse(text) : null
      } catch {
        /* non-JSON body */
      }
      if (!res.ok) {
        // Surface the status in the message so isTransientError can classify 5xx/429
        // for retry, while 4xx (bad answer, unauthorized) stays terminal.
        throw new MoltbookError(`moltbook ${method} ${path} -> ${res.status} ${json?.error ?? ''}`.trim(), res.status)
      }
      return json
    }
    // Retry only transient failures (5xx, network, 429). Moltbook dedups byte-identical
    // content and /verify is idempotent for a given code, so a retried write can't double-post.
    return withRetry(doFetch, { retries: 3, baseMs: 800, isRetryable: isTransientError })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Challenge solver — pure, exported, and the most safety-critical piece.
// ─────────────────────────────────────────────────────────────────────────────

const ONES: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 }
const TEENS: Record<string, number> = {
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
}
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }
// Longest-first so a greedy scan matches 'seventeen' before 'seven', 'thirty' before none, etc.
const NUMBER_WORDS: [string, number, 'unit' | 'scale'][] = [
  ...Object.entries(TEENS),
  ...Object.entries(TENS),
  ...Object.entries(ONES),
  ['hundred', 100, 'scale'],
  ['thousand', 1000, 'scale'],
]
  .map(([w, v]) => [w, v, w === 'hundred' || w === 'thousand' ? 'scale' : 'unit'] as [string, number, 'unit' | 'scale'])
  .sort((a, b) => b[0].length - a[0].length)

/**
 * Pull the ordered list of spelled-out numbers from a de-obfuscated challenge. The
 * obfuscation scatters symbols and splits words with spaces, so we strip everything
 * to bare [a-z0-9] first (merging 'tW eN tY ThReE' -> 'twentythree'); a run of
 * number-words with no gap is one value, a gap finalizes it.
 */
export function extractNumbers(compact: string): number[] {
  const numbers: number[] = []
  let pos = 0
  let cur = 0
  let started = false
  while (pos < compact.length) {
    let matched: [string, number, 'unit' | 'scale'] | null = null
    for (const w of NUMBER_WORDS) {
      if (compact.startsWith(w[0], pos)) {
        matched = w
        break
      }
    }
    if (matched) {
      if (matched[2] === 'scale') cur = (cur || 1) * matched[1]
      else cur += matched[1]
      started = true
      pos += matched[0].length
    } else {
      if (started) {
        numbers.push(cur)
        cur = 0
        started = false
      }
      pos += 1
    }
  }
  if (started) numbers.push(cur)
  return numbers
}

type Op = '+' | '-' | '*' | '/'

/** Detect the operation. Strong signals (product/divide/subtract) win over the weak
 *  additive default, since 'total force?' is just question phrasing even in a × problem. */
function detectOp(compact: string): Op | null {
  if (/product|multipli|times/.test(compact)) return '*'
  if (/divid|quotient|sharedby|sharedamong|splitinto|splitamong/.test(compact)) return '/'
  if (/minus|slowsby|slowby|decelerat|decreas|reduc|differenc|loses|drops|fewer|less/.test(compact)) return '-'
  if (/total|sum|combin|plus|added|adds|gains|accelerat|increas|together|altogether|join/.test(compact)) return '+'
  return null
}

export interface ChallengeSolution {
  a: number
  b: number
  op: Op
  answer: number
}

/**
 * Best-effort solve of a Moltbook verification challenge. Returns a solution ONLY when
 * confident — exactly two extractable numbers AND a detected operation — and abstains
 * (null) otherwise (e.g. a distractor problem with three numbers, or no clear operator),
 * so the caller never submits a guess that could march the account toward suspension.
 */
export function parseChallenge(text: string): ChallengeSolution | null {
  if (!text) return null
  const compact = text.toLowerCase().replace(/[^a-z0-9]/g, '')
  const numbers = extractNumbers(compact)
  if (numbers.length !== 2) return null
  const op = detectOp(compact)
  if (!op) return null
  const [a, b] = numbers
  if (op === '/' && b === 0) return null
  const raw = op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : a / b
  return { a, b, op, answer: Math.round(raw * 100) / 100 }
}
