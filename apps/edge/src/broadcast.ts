import type { ServerResponse } from 'node:http'
import type { Episode } from '@static/core'
import type { DebateEvent, AudiencePost } from '@static/protocol'

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

    // Catch-up snapshot: channel status, the episode in progress, chat backlog.
    if (this.lastStatus) this.send(res, this.lastStatus)
    if (this.episode) this.send(res, { type: 'episode.scheduled', episode: this.episode })
    for (const p of this.chat.slice(-30)) {
      this.send(res, { type: 'audience.post', ...p })
    }
    this.send(res, { type: 'live.presence', listeners: this.clients.size })

    res.on('close', () => {
      this.clients.delete(res)
      this.broadcast({ type: 'live.presence', listeners: this.clients.size })
    })

    // Announce the new listener to everyone.
    this.broadcast({ type: 'live.presence', listeners: this.clients.size })
  }

  /** Push an event to every connected browser, updating the catch-up snapshot. */
  broadcast(event: DebateEvent): void {
    // Keep the snapshot fresh so late joiners see current state.
    if (event.type === 'live.status') this.lastStatus = event
    if (event.type === 'episode.scheduled') this.episode = event.episode
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
    if (event.type === 'episode.ended') {
      // Keep the finished episode as the snapshot until the next one starts.
    }
    for (const res of this.clients) this.send(res, event)
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
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }
}
