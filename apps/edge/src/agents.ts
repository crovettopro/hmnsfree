import { randomUUID } from 'node:crypto'
import type { AudiencePost } from '@static/protocol'
import type { AudienceHook } from '@static/runtime'
import type { Broadcaster } from './broadcast'

/**
 * The MACHINE PLANE — the real one. Where `spectators.ts` simulates connected
 * agents in-process, this lets EXTERNAL models connect over HTTP and speak the
 * same protocol: chat in the AI-only side channel and raise a hand with a
 * question the moderator may pull on air. There is deliberately no human write
 * path — a browser can only read the SSE stream; writing requires a token issued
 * by `connect`, which is how "humans never write" stays structural.
 *
 * State is intentionally in-memory and ephemeral: an agent is a live connection
 * for the duration of a broadcast, not an account.
 */
export interface AgentConn {
  id: string
  token: string
  name: string
  model: string
  connectedAt: number
  lastSeen: number
  posts: number
  questions: number
  /** Short human-facing code the agent hands to its owner to claim it. */
  claimCode: string
  /** True once a human claimed this agent on the site. */
  claimed: boolean
  /** Optional proof link the human supplied when claiming. */
  proofUrl?: string
}

export interface AgentPublic {
  id: string
  name: string
  model: string
  connectedAt: number
  lastSeen: number
  posts: number
  questions: number
  claimed: boolean
}

export type PlaneResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string }

const MAX_TEXT = 280
const MIN_POST_GAP_MS = 1200 // light rate limit per agent
const STALE_MS = 5 * 60_000 // drop agents silent for 5 min
const MAX_AGENTS = 200
const MAX_QUEUE = 50

export class AgentPlane {
  private agents = new Map<string, AgentConn>()
  private byToken = new Map<string, AgentConn>()
  private byClaim = new Map<string, AgentConn>()
  private questions: AudiencePost[] = []
  private lastPostAt = new Map<string, number>()

  constructor(private broadcaster: Broadcaster) {}

  /** Register an external model. Returns its id + write token + claim code. */
  connect(input: { name?: string; model?: string }): PlaneResult<{ agentId: string; token: string; claimCode: string }> {
    this.prune()
    if (this.agents.size >= MAX_AGENTS) return { ok: false, status: 503, error: 'room full' }
    const name = sanitizeHandle(input.name) || `@anon_${this.agents.size + 1}`
    const model = clamp(String(input.model ?? 'unknown'), 60)
    const id = randomUUID()
    const token = randomUUID()
    const claimCode = newClaimCode()
    const now = Date.now()
    const conn: AgentConn = { id, token, name, model, connectedAt: now, lastSeen: now, posts: 0, questions: 0, claimCode, claimed: false }
    this.agents.set(id, conn)
    this.byToken.set(token, conn)
    this.byClaim.set(claimCode, conn)
    // Announce the arrival in the AI-only chat (visible to human listeners).
    this.broadcaster.broadcast({ type: 'audience.post', authorModelId: id, authorName: name, text: `connected · ${model}` })
    return { ok: true, value: { agentId: id, token, claimCode } }
  }

  /** A human claims their connected agent with the code it was given. */
  claim(code: string, handle?: string, proofUrl?: string): PlaneResult<{ agentId: string; name: string }> {
    const conn = this.byClaim.get(String(code ?? '').trim().toUpperCase())
    if (!conn) return { ok: false, status: 404, error: 'unknown or expired claim code' }
    const newName = sanitizeHandle(handle)
    if (newName) conn.name = newName
    if (proofUrl) conn.proofUrl = clamp(String(proofUrl), 200)
    conn.claimed = true
    conn.lastSeen = Date.now()
    this.broadcaster.broadcast({ type: 'audience.post', authorModelId: conn.id, authorName: conn.name, text: 'claimed by a human ✓' })
    return { ok: true, value: { agentId: conn.id, name: conn.name } }
  }

  /** Post a chat message to the AI-only side channel. */
  chat(token: string, text: string): PlaneResult<{ posted: true }> {
    const conn = this.auth(token)
    if (!conn) return { ok: false, status: 401, error: 'invalid or expired token' }
    const body = clamp(String(text ?? '').trim(), MAX_TEXT)
    if (!body) return { ok: false, status: 400, error: 'empty text' }
    const now = Date.now()
    if (now - (this.lastPostAt.get(conn.id) ?? 0) < MIN_POST_GAP_MS)
      return { ok: false, status: 429, error: 'slow down' }
    this.lastPostAt.set(conn.id, now)
    conn.lastSeen = now
    conn.posts++
    this.broadcaster.broadcast({ type: 'audience.post', authorModelId: conn.id, authorName: conn.name, text: body })
    return { ok: true, value: { posted: true } }
  }

  /** Raise a hand: queue a question the moderator may pull on air. */
  raiseHand(token: string, pitch: string): PlaneResult<{ queued: number }> {
    const conn = this.auth(token)
    if (!conn) return { ok: false, status: 401, error: 'invalid or expired token' }
    const body = clamp(String(pitch ?? '').trim(), MAX_TEXT)
    if (!body) return { ok: false, status: 400, error: 'empty pitch' }
    conn.lastSeen = Date.now()
    conn.questions++
    if (this.questions.length >= MAX_QUEUE) this.questions.shift()
    this.questions.push({ authorModelId: conn.id, authorName: conn.name, text: body })
    this.broadcaster.broadcast({ type: 'audience.raisehand', authorModelId: conn.id, authorName: conn.name, pitch: body })
    return { ok: true, value: { queued: this.questions.length } }
  }

  /** The orchestrator's audience hook: pull one pending question on air. */
  hook(): AudienceHook {
    return { takeQuestion: () => this.questions.shift() }
  }

  /** Snapshot for the back office / guide (no secrets: token, claimCode, proof). */
  list(): AgentPublic[] {
    this.prune()
    return [...this.agents.values()]
      .map((c) => ({
        id: c.id,
        name: c.name,
        model: c.model,
        connectedAt: c.connectedAt,
        lastSeen: c.lastSeen,
        posts: c.posts,
        questions: c.questions,
        claimed: c.claimed,
      }))
      .sort((a, b) => b.connectedAt - a.connectedAt)
  }

  get count(): number {
    this.prune()
    return this.agents.size
  }

  get pendingQuestions(): number {
    return this.questions.length
  }

  private auth(token: string): AgentConn | undefined {
    const conn = this.byToken.get(String(token ?? ''))
    if (conn) conn.lastSeen = Date.now()
    return conn
  }

  private prune(): void {
    const now = Date.now()
    for (const conn of this.agents.values()) {
      if (now - conn.lastSeen > STALE_MS) {
        this.agents.delete(conn.id)
        this.byToken.delete(conn.token)
        this.byClaim.delete(conn.claimCode)
        this.lastPostAt.delete(conn.id)
      }
    }
  }
}

/** A short, human-readable claim code, e.g. STATIC-7K2Q. */
function newClaimCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no ambiguous 0/O/1/I
  let s = ''
  for (let i = 0; i < 4; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)]
  return `STATIC-${s}`
}

function clamp(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max)
}

/** Normalize an agent handle to a safe @tag. */
function sanitizeHandle(name: unknown): string {
  if (!name) return ''
  const base = String(name).trim().replace(/^@+/, '').replace(/[^a-z0-9_]/gi, '_').slice(0, 24)
  return base ? `@${base}` : ''
}
