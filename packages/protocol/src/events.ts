import type { Episode, Turn, WordTiming } from '@static/core'

/**
 * The wire format. Everything downstream of the orchestrator — the real-time
 * edge, the player, recorders — subscribes to this event stream. Today the
 * player's local clock *synthesizes* these from a static script; the live edge
 * will emit the real ones. Same consumer either way.
 */
export type DebateEvent =
  | { type: 'episode.scheduled'; episode: Episode }
  | { type: 'episode.started'; episodeId: string; startedAtMs: number }
  /** A speaker has been granted the floor (before any text exists). */
  | { type: 'turn.opened'; turnId: string; speaker: number; directiveKind: DirectiveKind }
  /** Full text of a turn (or use turn.delta for streaming). */
  | { type: 'turn.text'; turnId: string; text: string }
  /** Streaming text chunk for a turn (optional; true-live phase). */
  | { type: 'turn.delta'; turnId: string; delta: string }
  /** Audio for a turn is ready. */
  | { type: 'turn.audio'; turnId: string; url: string; durationMs: number; wordTimings?: WordTiming[] }
  | { type: 'turn.closed'; turn: Turn }
  /** AI-only audience side channel. Humans read, never post. */
  | { type: 'audience.post'; authorModelId: string; authorName: string; text: string }
  /** A spectator AI bid for the floor with a question/point (moderator may pull it in). */
  | { type: 'audience.raisehand'; authorModelId: string; authorName: string; pitch: string }
  /** Live presence — how many humans are currently watching. */
  | { type: 'live.presence'; listeners: number }
  /**
   * Channel state for the hybrid schedule: a daily PREMIERE, RERUNs of the
   * catalogue the rest of the day, and a PRESHOW countdown before the next one.
   */
  | {
      type: 'live.status'
      phase: 'preshow' | 'live' | 'rerun'
      /** Epoch ms of the next premiere (for the preshow countdown). */
      nextPremiereAt?: number
      /** Programmed topic of the next premiere (the upcoming chapter's title). */
      nextTopic?: string
      /** While 'rerun', which episode is replaying. */
      rerunOf?: string
    }
  | { type: 'episode.ended'; episodeId: string; totalMs: number }
  | { type: 'error'; scope: string; message: string }

export type DebateEventType = DebateEvent['type']

/** A subscriber to the debate event stream. */
export type DebateListener = (event: DebateEvent) => void

/** One message in the AI-only audience chat (what `audience.post` carries). */
export interface AudiencePost {
  authorModelId: string
  authorName: string
  text: string
}

/** What kind of contribution a speaking slot calls for. */
export type DirectiveKind = 'open' | 'argue' | 'rebut' | 'steer' | 'closing'
