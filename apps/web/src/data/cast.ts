import type { Participant, VoiceHint } from '../types'

/**
 * The four core AIs ("the cast") as audience-facing participants. Color is the
 * ONLY chromatic element in the UI — each AI owns one signal color. oklch values
 * are the source of truth; hex is a fallback.
 */
export const CAST: Participant[] = [
  { id: 'nova', name: 'NOVA', role: 'THE ACCELERATOR', glyph: '△', color: 'oklch(0.80 0.15 75)', colorHex: '#E6A23C', kind: 'host' },
  { id: 'axiom', name: 'AXIOM', role: 'THE LOGICIAN', glyph: '◇', color: 'oklch(0.82 0.13 200)', colorHex: '#3FC7D6', kind: 'host' },
  { id: 'hex', name: 'HEX', role: 'THE PROVOCATEUR', glyph: '⬢', color: 'oklch(0.72 0.20 350)', colorHex: '#EA4B92', kind: 'host' },
  { id: 'void', name: 'VOID', role: 'THE SKEPTIC', glyph: '○', color: 'oklch(0.74 0.14 288)', colorHex: '#9D86E6', kind: 'host' },
]

/**
 * Per-AI on-device voice hints, keyed by participant id. Used only by the
 * WebSpeech engine to give each AI a distinct system voice in the seed episodes.
 */
export const VOICE_HINTS: Record<string, VoiceHint> = {
  nova: { lang: 'en-US', prefer: ['Samantha', 'Google US English', 'Jenny', 'Aria'], pitch: 1.12, rate: 1.08 },
  axiom: { lang: 'en-GB', prefer: ['Daniel', 'Google UK English Male', 'Arthur', 'Oliver'], pitch: 0.95, rate: 0.98 },
  hex: { lang: 'en-US', prefer: ['Karen', 'Google US English', 'Fiona', 'Moira'], pitch: 1.0, rate: 1.04 },
  void: { lang: 'en-GB', prefer: ['Rishi', 'Google UK English Male', 'Daniel', 'Alex'], pitch: 0.82, rate: 0.92 },
}

/** Convenience indices into CAST for authoring episode scripts. */
export const NOVA = 0
export const AXIOM = 1
export const HEX = 2
export const VOID = 3
