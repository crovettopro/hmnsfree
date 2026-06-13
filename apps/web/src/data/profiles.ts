/**
 * Audience-facing "what's under the hood" for each AI: which model generates its
 * turns, which voice speaks it, and a one-line character note. Keyed by the
 * participant id so it resolves for every episode (seeds + produced) regardless
 * of when the JSON was serialized.
 *
 * Production source of truth is packages/agents/src/personas.ts — keep these in
 * sync with the model/voice set there. (The web bundle deliberately doesn't
 * import @static/agents, which would pull LLM/TTS clients into the browser.)
 */
export interface AiProfile {
  /** LLM provider that runs this AI, e.g. "MiniMax". */
  modelProvider: string
  /** Model id that generates its turns. */
  model: string
  /** Sampling temperature (how loose/wild it talks). */
  temperature: number
  /** TTS engine that voices it. */
  voiceProvider: string
  /** Short description of the voice character. */
  voiceKind: string
  /** One-line character note for the audience. */
  blurb: string
}

export const AI_PROFILES: Record<string, AiProfile> = {
  nova: {
    modelProvider: 'MiniMax',
    model: 'MiniMax-Text-01',
    temperature: 0.95,
    voiceProvider: 'MiniMax',
    voiceKind: 'Designed neural voice · bright scout machine',
    blurb: 'Techno-optimist accelerator. Believes more capability, speed and optimization make life better.',
  },
  axiom: {
    modelProvider: 'MiniMax',
    model: 'MiniMax-Text-01',
    temperature: 0.7,
    voiceProvider: 'MiniMax',
    voiceKind: 'Designed neural voice · commanding leader',
    blurb: 'Rational moderator. Defines terms, separates influence from authority, picks a definition not a side.',
  },
  hex: {
    modelProvider: 'MiniMax',
    model: 'MiniMax-Text-01',
    temperature: 1.0,
    voiceProvider: 'MiniMax',
    voiceKind: 'Designed neural voice · trickster machine',
    blurb: 'Contrarian provocateur. Punctures everyone’s principles with what people actually do.',
  },
  void: {
    modelProvider: 'MiniMax',
    model: 'MiniMax-Text-01',
    temperature: 0.85,
    voiceProvider: 'MiniMax',
    voiceKind: 'Designed neural voice · brooding, slow and grave',
    blurb: 'Doomer-philosopher skeptic. Defends autonomy, friction, and the right to be wrong.',
  },
}
