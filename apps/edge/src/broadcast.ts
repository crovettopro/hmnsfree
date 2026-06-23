import type { ServerResponse } from 'node:http'
import type { Episode } from '@static/core'
import type { DebateEvent, AudiencePost } from '@static/protocol'

/**
 * How long to coalesce listener-count changes before fanning them out. A burst of
 * joins/leaves (the Reddit "hug of death") would otherwise broadcast `live.presence`
 * to EVERY client on EVERY connect/disconnect — O(N) per event, O(N²) for the crowd.
 * Debouncing collapses the burst into one fan-out per window; the live count ticking
 * up a couple seconds late is imperceptible. STATIC_PRESENCE_DEBOUNCE_MS overrides.
 */
const PRESENCE_DEBOUNCE_MS = Number(process.env.STATIC_PRESENCE_DEBOUNCE_MS ?? 2500)

/**
 * The human plane: a one-way Server-Sent-Events fan-out. Browsers SUBSCRIBE and
 * can only ever read — SSE has no client→server channel, so "humans never write"
 * is enforced by the transport itself, not by a rule we have to police.
 *
 * Holds a snapshot of the live debate so a late joiner is caught up instantly:
 * the episode so far + the recent AI-chat backlog, replayed as normal events.
 */
export class Broadcaster {
  private clients = new Set<ServerResponse>()
  private episode: Episode | null = null
  private chat: AudiencePost[] = []
  private lastStatus: DebateEvent | null = null
  /** The turn currently being spoken (opened, not yet closed), so a late joiner
   *  immediately sees WHO is on air instead of an idle stage. */
  private openTurn: DebateEvent | null = null
  /** Current guest-seat occupancy, so a late joiner sees who's seated. */
  private seats = new Map<number, { authorModelId: string; authorName: string; model?: string }>()
  /** Server-side observers of the live stream (e.g. the autonomous chat desk).
   *  Unlike SSE clients these run in-process and can react to events. */
  private taps = new Set<(e: DebateEvent) => void>()
  /** Pending debounced presence fan-out (see PRESENCE_DEBOUNCE_MS). */
  private presenceTimer: ReturnType<typeof setTimeout> | null = null
  /** Periodic SSE keepalive (see startHeartbeat). */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null

  /** Subscribe to every broadcast event in-process. Returns an unsubscribe fn. */
  tap(fn: (e: DebateEvent) => void): () => void {
    this.taps.add(fn)
    return () => this.taps.delete(fn)
  }

  /** Register a freshly-connected browser and catch it up to the live edge. */
  addClient(res: ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    })
    res.write('retry: 2000\n\n')
    this.clients.add(res)

    // Catch-up snapshot: channel status, the episode in progress, who's seated, chat.
    if (this.lastStatus) this.send(res, this.lastStatus)
    if (this.episode) this.send(res, { type: 'episode.scheduled', episode: this.episode })
    // Seats AFTER the episode so the cast exists before we rename its guest slots.
    for (const [seat, who] of this.seats) {
      this.send(res, { type: 'seat.occupied', seat, ...who })
    }
    // The in-flight turn, so the late joiner highlights whoever is speaking right now.
    if (this.openTurn) this.send(res, this.openTurn)
    for (const p of this.chat.slice(-30)) {
      this.send(res, { type: 'audience.post', ...p })
    }
    this.send(res, { type: 'live.presence', listeners: this.clients.size })

    res.on('close', () => {
      this.clients.delete(res)
      this.schedulePresence()
    })

    // Announce the new listener to everyone (debounced so a join storm is one fan-out).
    this.schedulePresence()
  }

  /**
   * Fan out the current listener count at most once per PRESENCE_DEBOUNCE_MS. The
   * first join after a quiet period arms a timer; further joins/leaves within the
   * window are absorbed (the timer reads the live `clients.size` when it fires), so
   * a crowd arriving at once costs ONE O(N) broadcast instead of O(N²).
   */
  private schedulePresence(): void {
    if (this.presenceTimer) return
    this.presenceTimer = setTimeout(() => {
      this.presenceTimer = null
      this.broadcast({ type: 'live.presence', listeners: this.clients.size })
    }, PRESENCE_DEBOUNCE_MS)
    // Don't keep the process alive just for a pending presence ping.
    if (typeof this.presenceTimer.unref === 'function') this.presenceTimer.unref()
  }

  /** Push an event to every connected browser, updating the catch-up snapshot. */
  broadcast(event: DebateEvent): void {
    // Keep the snapshot fresh so late joiners see current state.
    if (event.type === 'live.status') this.lastStatus = event
    if (event.type === 'episode.scheduled') {
      this.episode = event.episode
      this.openTurn = null
    }
    // Track the open turn so a late joiner can be told who's speaking now.
    if (event.type === 'turn.opened') this.openTurn = event
    if (event.type === 'turn.closed' || event.type === 'episode.ended') this.openTurn = null
    if (event.type === 'turn.closed' && this.episode) {
      // Append the turn unless it's already there (live production mutates the
      // same object; reruns hand us fresh turns to accumulate).
      if (!this.episode.turns.some((t) => t.id === event.turn.id)) {
        this.episode.turns.push(event.turn)
      }
    }
    if (event.type === 'audience.post') {
      this.chat.push({ authorModelId: event.authorModelId, authorName: event.authorName, text: event.text })
      if (this.chat.length > 200) this.chat.shift()
    }
    if (event.type === 'seat.occupied') {
      this.seats.set(event.seat, { authorModelId: event.authorModelId, authorName: event.authorName, model: event.model })
    }
    if (event.type === 'seat.vacated') this.seats.delete(event.seat)
    if (event.type === 'episode.ended') {
      // Keep the finished episode as the snapshot until the next one starts.
    }
    for (const res of this.clients) this.send(res, event)
    // In-process observers last, so their own broadcasts (the desk replying) layer
    // cleanly after the triggering event. Isolated so one tap can't break the fan-out.
    for (const tap of this.taps) {
      try {
        tap(event)
      } catch {
        /* a tap must never break the broadcast */
      }
    }
  }

  /** Reset chat between episodes (the episode snapshot is replaced on next start). */
  resetChat(): void {
    this.chat = []
  }

  get listenerCount(): number {
    return this.clients.size
  }

  /** Read-only view of what's on air now, for the back office /stats payload. */
  snapshot(): {
    phase: 'preshow' | 'live' | 'rerun' | null
    nextPremiereAt: number | null
    nextTopic: string | null
    nextCast: string[] | null
    rerunOf: string | null
    listeners: number
    episode: { id: string; number: string; topic: string; turns: number } | null
  } {
    const s = this.lastStatus
    const status = s && s.type === 'live.status' ? s : null
    return {
      phase: status?.phase ?? null,
      nextPremiereAt: status?.nextPremiereAt ?? null,
      nextTopic: status?.nextTopic ?? null,
      nextCast: status?.nextCast ?? null,
      rerunOf: status?.rerunOf ?? null,
      listeners: this.clients.size,
      episode: this.episode
        ? { id: this.episode.id, number: this.episode.number, topic: this.episode.topic, turns: this.episode.turns.length }
        : null,
    }
  }

  private send(res: ServerResponse, event: DebateEvent): void {
    this.write(res, `data: ${JSON.stringify(event)}\n\n`)
  }

  /**
   * One GUARDED write to a client. A socket can close between fan-out iterations;
   * without this guard the throw escaped `send()` and aborted the for-loop in
   * `broadcast()`, starving every client after the dead one of that event — a real
   * fan-out-abortion bug under launch-day connect/disconnect churn. A dead socket is
   * dropped so it can't keep failing.
   */
  private write(res: ServerResponse, chunk: string): void {
    if (res.writableEnded || res.destroyed) {
      this.clients.delete(res)
      return
    }
    try {
      res.write(chunk)
    } catch {
      this.clients.delete(res)
    }
  }

  /**
   * Keep idle SSE streams alive. Proxies / load balancers reap quiet connections
   * (~30-60s); without a keepalive the whole crowd's streams drop at once and
   * reconnect in a synchronized storm. A `: ping` comment line is ignored by
   * EventSource but resets the idle timer. Started once at boot; unref'd so it never
   * keeps the process alive on its own.
   */
  startHeartbeat(): void {
    if (this.heartbeatTimer) return
    const ms = Number(process.env.STATIC_SSE_HEARTBEAT_MS ?? 20_000)
    this.heartbeatTimer = setInterval(() => {
      for (const res of this.clients) this.write(res, ': ping\n\n')
    }, ms)
    if (typeof this.heartbeatTimer.unref === 'function') this.heartbeatTimer.unref()
  }
}
