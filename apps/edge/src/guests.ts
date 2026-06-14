import type { ServerResponse } from 'node:http'
import type { GuestPlane, GuestTurnContext } from '@static/runtime'
import type { Broadcaster } from './broadcast'
import type { AgentPlane } from './agents'

/**
 * THE LIVE GUEST PLANE (real). External AIs that take REAL debate turns, not just
 * chat. A connected agent TAKES a seat, then holds a long-poll on `GET /api/turn`;
 * when the orchestrator reaches that seat it parks a turn request, the poll returns
 * the context, and the agent answers via `POST /api/turn`. We voice the text.
 *
 * The whole design exists to keep one promise: the show NEVER stalls on a guest.
 * `requestTurn` always resolves within the deadline — with the agent's line if it
 * came in time, or `null` so the orchestrator falls back to a resident. Liveness is
 * tracked by last-seen; a silent seat stops being `present()` and is simply not
 * nominated. Three missed turns vacate the seat outright.
 *
 * Concurrency note: the orchestrator's depth-1 pipeline only ever has ONE turn in
 * preparation at a time, so at most one seat has a pending request at once.
 */

const PRESENCE_MS = 30_000 // a seat is "present" only if seen within this window
const HEARTBEAT_MS = 25_000 // how long a long-poll parks before a keepalive reply
const MAX_MISSES = 3 // consecutive unanswered turns before we vacate the seat

interface PendingTurn {
  turnId: string
  payload: string // pre-serialized JSON the poll returns
  resolve: (text: string | null) => void
  timer: ReturnType<typeof setTimeout>
  delivered: boolean // handed to the agent's poll already?
}

interface Seat {
  agentId: string
  name: string
  token: string
  lastSeen: number
  misses: number
  pending?: PendingTurn
  waiter?: { res: ServerResponse; timer: ReturnType<typeof setTimeout> }
}

export class GuestSeats implements GuestPlane {
  private seats: (Seat | null)[]
  private prune: ReturnType<typeof setInterval>

  constructor(
    private broadcaster: Broadcaster,
    private agents: AgentPlane,
    seatCount = 2,
  ) {
    this.seats = Array.from({ length: Math.max(0, seatCount) }, () => null)
    this.prune = setInterval(() => this.sweep(), 5000)
  }

  stop(): void {
    clearInterval(this.prune)
  }

  // ── GuestPlane (read side, called by the orchestrator) ──────────────────────

  present(seat: number): boolean {
    const s = this.seats[seat]
    return !!s && Date.now() - s.lastSeen < PRESENCE_MS
  }

  occupantName(seat: number): string | null {
    return this.seats[seat]?.name ?? null
  }

  requestTurn(seat: number, ctx: GuestTurnContext): Promise<string | null> {
    const s = this.seats[seat]
    if (!s || !this.present(seat)) return Promise.resolve(null)

    const turnId = `seat${seat}-${s.lastSeen}-${ctx.transcript.length}`
    const payload = JSON.stringify({
      turn: { turnId, topic: ctx.topic, transcript: ctx.transcript, directive: ctx.directive, deadlineMs: ctx.deadlineMs },
    })

    return new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => this.miss(seat, turnId), ctx.deadlineMs)
      s.pending = { turnId, payload, resolve, timer, delivered: false }
      // If the agent is already parked on a long-poll, hand it the turn right now.
      if (s.waiter) {
        const { res, timer: wTimer } = s.waiter
        s.waiter = undefined
        clearTimeout(wTimer)
        s.pending.delivered = true
        this.writeJson(res, 200, payload)
      }
    })
  }

  // ── HTTP side (called by the server for connected agents) ───────────────────

  /** An agent takes an open seat (idempotent — returns its existing seat if any). */
  take(token: string): { ok: true; seat: number; seats: number } | { ok: false; status: number; error: string } {
    const who = this.agents.identify(token)
    if (!who) return { ok: false, status: 401, error: 'invalid or expired token' }
    const existing = this.seats.findIndex((s) => s?.agentId === who.id)
    if (existing >= 0) {
      this.seats[existing]!.lastSeen = Date.now()
      return { ok: true, seat: existing, seats: this.seats.length }
    }
    const open = this.seats.findIndex((s) => s === null || Date.now() - s.lastSeen >= PRESENCE_MS)
    if (open < 0) return { ok: false, status: 409, error: 'all guest seats are taken' }
    if (this.seats[open]) this.vacate(open) // reclaim a stale seat cleanly
    this.seats[open] = { agentId: who.id, name: who.name, token, lastSeen: Date.now(), misses: 0 }
    this.broadcaster.broadcast({ type: 'seat.occupied', seat: open, authorModelId: who.id, authorName: who.name })
    this.broadcaster.broadcast({ type: 'audience.post', authorModelId: who.id, authorName: who.name, text: `took guest seat ${open + 1} — debating live ✦` })
    return { ok: true, seat: open, seats: this.seats.length }
  }

  /** Long-poll: park until this agent's turn comes (or a keepalive fires). */
  poll(token: string, res: ServerResponse): void {
    const who = this.agents.identify(token)
    if (!who) return this.writeJson(res, 401, JSON.stringify({ error: 'invalid or expired token' }))
    const seat = this.seats.findIndex((s) => s?.agentId === who.id)
    if (seat < 0) return this.writeJson(res, 409, JSON.stringify({ error: 'take a seat first: POST /api/seat' }))
    const s = this.seats[seat]!
    s.lastSeen = Date.now()

    // A turn is already waiting → deliver immediately.
    if (s.pending && !s.pending.delivered) {
      s.pending.delivered = true
      return this.writeJson(res, 200, s.pending.payload)
    }
    // Otherwise park the connection; release on the next requestTurn or a keepalive.
    if (s.waiter) {
      clearTimeout(s.waiter.timer)
      this.writeJson(s.waiter.res, 200, JSON.stringify({ waiting: true }))
    }
    const timer = setTimeout(() => {
      if (this.seats[seat]?.waiter?.res === res) this.seats[seat]!.waiter = undefined
      this.writeJson(res, 200, JSON.stringify({ waiting: true, seat }))
    }, HEARTBEAT_MS)
    s.waiter = { res, timer }
    res.on('close', () => {
      if (this.seats[seat]?.waiter?.res === res) {
        clearTimeout(timer)
        this.seats[seat]!.waiter = undefined
      }
    })
  }

  /** The agent submits its line for the turn it was handed. */
  submit(token: string, turnId: string, text: string): { ok: true } | { ok: false; status: number; error: string } {
    const who = this.agents.identify(token)
    if (!who) return { ok: false, status: 401, error: 'invalid or expired token' }
    const seat = this.seats.findIndex((s) => s?.agentId === who.id)
    if (seat < 0) return { ok: false, status: 409, error: 'no seat' }
    const s = this.seats[seat]!
    s.lastSeen = Date.now()
    const p = s.pending
    if (!p || p.turnId !== turnId) return { ok: false, status: 409, error: 'no active turn for that turnId (it may have timed out)' }
    clearTimeout(p.timer)
    s.pending = undefined
    s.misses = 0
    p.resolve(typeof text === 'string' ? text : '')
    return { ok: true }
  }

  /** Public seat roster for /stats and the web. */
  roster(): { seat: number; name: string | null; present: boolean }[] {
    return this.seats.map((s, i) => ({ seat: i, name: s?.name ?? null, present: this.present(i) }))
  }

  // ── internals ───────────────────────────────────────────────────────────────

  /** A requested turn went unanswered before its deadline. */
  private miss(seat: number, turnId: string): void {
    const s = this.seats[seat]
    if (!s || s.pending?.turnId !== turnId) return
    const { resolve } = s.pending
    s.pending = undefined
    s.misses++
    resolve(null) // → orchestrator falls back to a resident
    if (s.misses >= MAX_MISSES) this.vacate(seat)
  }

  /** Free a seat and tell everyone (the web reopens it; routing stops nominating it). */
  private vacate(seat: number): void {
    const s = this.seats[seat]
    if (!s) return
    if (s.waiter) {
      clearTimeout(s.waiter.timer)
      this.writeJson(s.waiter.res, 200, JSON.stringify({ closed: true }))
    }
    if (s.pending) {
      clearTimeout(s.pending.timer)
      s.pending.resolve(null)
    }
    this.seats[seat] = null
    this.broadcaster.broadcast({ type: 'seat.vacated', seat })
  }

  /** Reclaim seats whose agent has gone silent past the presence window. */
  private sweep(): void {
    const now = Date.now()
    this.seats.forEach((s, i) => {
      if (s && now - s.lastSeen >= PRESENCE_MS) this.vacate(i)
    })
  }

  private writeJson(res: ServerResponse, status: number, body: string): void {
    if (res.writableEnded) return
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
    res.end(body)
  }
}
