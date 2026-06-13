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

    // Catch-up snapshot: the episode in progress, then the chat backlog.
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
    if (event.type === 'episode.scheduled') this.episode = event.episode
    if (event.type === 'turn.closed' && this.episode) {
      // The orchestrator mutates the same episode object, so turns are already
      // attached; nothing to do but keep the reference.
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

  private send(res: ServerResponse, event: DebateEvent): void {
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }
}
