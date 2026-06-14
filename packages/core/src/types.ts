/**
 * STATIC shared domain model — the single source of truth for the whole
 * platform. Web, studio, edge, RSS and (future) user SDKs all read these shapes.
 *
 * Two layers, deliberately separate:
 *   - Presentation: what a listener sees (Participant, Episode, Turn).
 *   - Production:    what makes a turn exist (Persona = Participant + how it
 *                    thinks and speaks). The web never needs Persona internals.
 */

// ───────────────────────────────────────────────────────── presentation layer

/** A debate participant as the audience sees it. No faces — a geometric glyph. */
export interface Participant {
  id: string
  name: string
  /** Short role line, e.g. "THE ACCELERATOR". */
  role: string
  /** Single Unicode geometric glyph. */
  glyph: string
  /** The participant's one "signal" color (oklch source of truth). */
  color: string
  /** Hex fallback for environments without oklch. */
  colorHex: string
  /** host = permanent cast; guest = temporary AI guest with its own signal. */
  kind: 'host' | 'guest'
}

/** Word-level timing for syncing transcript highlighting to audio. */
export interface WordTiming {
  word: string
  startMs: number
  endMs: number
}

/** Audio rendered for a single turn. */
export interface TurnAudio {
  /** URL/path to the clip (relative to the web app's public dir, or absolute). */
  url: string
  /** Container/codec, e.g. "audio/mpeg". */
  format: string
  durationMs: number
  /** Optional word timings for fine-grained sync. */
  wordTimings?: WordTiming[]
}

/** One spoken turn. The atom of a debate; the list of these can grow live. */
export interface Turn {
  id: string
  /** Index of the speaker within the episode's `cast`. */
  speaker: number
  /** Spoken text. */
  text: string
  /** Start offset within the episode, ms. */
  startMs: number
  /** Visual/audio duration, ms. Authoritative for the timeline. */
  durationMs: number
  /** Present once voiced. Absent for a not-yet-rendered (e.g. streaming) turn. */
  audio?: TurnAudio
  /** Optional production hints (emphasis, tone) for richer TTS. */
  directives?: { emphasis?: string[]; tone?: string }
}

export type EpisodeStatus = 'scheduled' | 'producing' | 'premiering' | 'published'

export interface Episode {
  id: string
  /** Display number, e.g. "EP.024". */
  number: string
  /** Mono tag above the headline, e.g. "DEBATE · WEEK 24". */
  tag: string
  /** The debate question / headline. */
  topic: string
  /** Listener count label, e.g. "12.4K". */
  listeners: string
  /** Participants for this episode, in row/legend order. */
  cast: Participant[]
  /** Ordered turns. May grow live in a streaming source. */
  turns: Turn[]
  status: EpisodeStatus
  /** ISO datetime of the scheduled premiere, if any. */
  publishAt?: string
  /** Optional master audio for the whole episode (RSS/YouTube). */
  master?: TurnAudio
  /** Optional cover art URL, e.g. "/episodes/ep-01/cover.png". */
  cover?: string
}

// ──────────────────────────────────────────────────────────── production layer

/** How a persona "thinks": which model/provider voices its reasoning. */
export interface ModelRef {
  /** Adapter id, e.g. "anthropic" | "openai" | "mock" | "byo". */
  provider: string
  /** Provider-specific model id, e.g. "claude-sonnet-4-6". */
  model: string
  /** Sampling temperature, etc. (provider-agnostic subset). */
  temperature?: number
  maxTokens?: number
}

/** How a persona "speaks": which TTS voice renders it. */
export interface VoiceRef {
  /** Adapter id, e.g. "elevenlabs" | "openai" | "mock". */
  provider: string
  /** Provider-specific voice id. */
  voiceId: string
  /** Per-voice tuning (provider interprets as it can). */
  stability?: number
  similarity?: number
  /** Expressiveness/"style" exaggeration. Lower = flatter, more machine-like. */
  style?: number
  pitch?: number
  rate?: number
}

/**
 * A full cast member for production: the presentation Participant plus the
 * persona prompt, the model that generates its turns, and the voice that speaks
 * them. Model and voice are independent — that's what enables genuine diversity
 * and the future "bring your own model" phase.
 */
export interface Persona extends Participant {
  /** System prompt establishing character, stance, and speaking style. */
  systemPrompt: string
  model: ModelRef
  voice: VoiceRef
}

/** Strip a Persona down to the audience-facing Participant. */
export function toParticipant(p: Persona): Participant {
  const { id, name, role, glyph, color, colorHex, kind } = p
  return { id, name, role, glyph, color, colorHex, kind }
}
