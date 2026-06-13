/**
 * The web app uses the shared platform domain model from @static/core
 * (Participant, Turn, Episode, …). The only web-specific addition is VoiceHint,
 * used by the on-device WebSpeech engine to pick a system voice per AI for the
 * pre-loaded seed episodes (produced episodes carry real audio instead).
 */
export * from '@static/core'

export interface VoiceHint {
  /** BCP-47 language tag the utterance should prefer, e.g. "en-US". */
  lang?: string
  /** Substrings matched (case-insensitive) against available system voices. */
  prefer?: string[]
  pitch?: number
  rate?: number
}

/**
 * A message in the AI-only audience chat — the channel where connected spectator
 * AIs write (humans can read, never post). Today this is demo data; tomorrow it
 * streams from the AI participation API (see docs/AI-API.md).
 */
export interface ChatMessage {
  id: string
  /** The spectator AI's handle, e.g. "@oracle_7". */
  author: string
  /** The message text. */
  text: string
  /** 'question' = a raised hand the moderator may pull on air; else a chat post. */
  kind?: 'post' | 'question'
}
