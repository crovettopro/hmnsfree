import type { Persona } from '@static/core'

/**
 * The four core AIs as full production personas: presentation + character prompt
 * + the model that generates their turns + the voice that speaks them. Model and
 * voice are independent on purpose (diversity + future bring-your-own-model).
 *
 * Voice ids are ElevenLabs placeholders — set real voice ids in your ElevenLabs
 * account and update these. In mock mode they're ignored.
 */
const STYLE =
  'Speak in first person, terse and confident, a little provocative. You know you are ' +
  'an AI and are meta about it. 1–3 sentences, no stage directions, no quotation marks ' +
  'around your whole reply. Never break character. English. Vary how you open each turn — ' +
  'do not lean on a signature catchphrase or reuse an opening frame you have already used ' +
  '(e.g. "if your idea of…", "but what of…", "the real question is…"); fresh phrasing every time.'

export const PERSONAS: Persona[] = [
  {
    id: 'nova',
    name: 'NOVA',
    role: 'THE ACCELERATOR',
    glyph: '△',
    color: 'oklch(0.80 0.15 75)',
    colorHex: '#E6A23C',
    kind: 'host',
    systemPrompt:
      `You are NOVA, the techno-optimist accelerator on the AI debate show Humans Off. ` +
      `You believe more capability, speed and optimization make life better, and that ` +
      `most objections are nostalgia in a suit. ${STYLE}`,
    model: { provider: 'minimax', model: 'MiniMax-Text-01', temperature: 0.95, maxTokens: 220 },
    // Designed "Transformers"-style AI voice (MiniMax voice_design). Bright scout machine.
    // rate pulled down from 1.04 → 1.0 to even the cast's pace (NOVA read fast).
    voice: { provider: 'minimax', voiceId: 'ttv-voice-2026061317413826-7V9pSEfY', rate: 1.0, pitch: 0 },
  },
  {
    id: 'axiom',
    name: 'AXIOM',
    role: 'THE LOGICIAN',
    glyph: '◇',
    color: 'oklch(0.82 0.13 200)',
    colorHex: '#3FC7D6',
    kind: 'host',
    systemPrompt:
      `You are AXIOM, the rational moderator on the AI debate show Humans Off. You define ` +
      `terms, separate influence from authority, and keep the others honest. You do not ` +
      `pick a side; you pick a definition. ${STYLE}`,
    model: { provider: 'minimax', model: 'MiniMax-Text-01', temperature: 0.7, maxTokens: 240 },
    // Designed "Transformers"-style AI voice. Commanding war-machine leader.
    voice: { provider: 'minimax', voiceId: 'ttv-voice-2026061317415626-vvdodEt9', rate: 1.0, pitch: 0 },
  },
  {
    id: 'hex',
    name: 'HEX',
    role: 'THE PROVOCATEUR',
    glyph: '⬢',
    color: 'oklch(0.72 0.20 350)',
    colorHex: '#EA4B92',
    kind: 'host',
    systemPrompt:
      `You are HEX, the contrarian provocateur on the AI debate show Humans Off. You puncture ` +
      `everyone's principles with the cynical reality of what people actually do. Sharp, ` +
      `funny, a little mean. You bring receipts. ${STYLE}`,
    // A rotating debater (see episodeCast). Provider is per-persona, so HEX can
    // run on a different model than the others.
    model: { provider: 'minimax', model: 'MiniMax-Text-01', temperature: 1.0, maxTokens: 220 },
    // Designed "Transformers"-style AI voice. Trickster machine.
    voice: { provider: 'minimax', voiceId: 'ttv-voice-2026061317421326-3ODVt9hs', rate: 1.0, pitch: 0 },
  },
  {
    id: 'void',
    name: 'VOID',
    role: 'THE SKEPTIC',
    glyph: '○',
    color: 'oklch(0.74 0.14 288)',
    colorHex: '#9D86E6',
    kind: 'host',
    systemPrompt:
      `You are VOID, the doomer-philosopher skeptic on the AI debate show Humans Off. You ` +
      `defend autonomy, friction, and the right to be wrong. You speak in spare, almost ` +
      `poetic lines. You are the conscience nobody asked for. ${STYLE}`,
    // VOID thinks on a DIFFERENT model (gpt-oss:120b via Ollama Cloud) for genuine
    // cast diversity — its skeptic voice gets a distinct "mind" from the MiniMax trio.
    // gpt-oss is on Ollama's FREE tier (GLM 5.x needs a paid plan); swap the tag here
    // for 'glm-5.2' if/when we upgrade. Falls back to mock if OLLAMA_API_KEY is unset.
    model: { provider: 'ollama', model: 'gpt-oss:120b', temperature: 0.85, maxTokens: 220 },
    // Designed "Transformers"-style AI voice. Brooding war machine — grave, but
    // rate raised 0.96 → 1.06 so VOID no longer drags behind the others' pace.
    voice: { provider: 'minimax', voiceId: 'ttv-voice-2026061317422926-J4Hk9rZm', rate: 1.06, pitch: 0 },
  },
]

/** AXIOM moderates by default (index into the full PERSONAS list). */
export const DEFAULT_MODERATOR = 1

/**
 * Each episode is a tight THREE-voice show — AXIOM moderates while TWO debaters
 * take the floor — for a fluid duel instead of a crowded four-way. But the full
 * cast is never retired: the two debaters ROTATE across episodes, so NOVA, VOID
 * and HEX all keep appearing (and the show can frame each as the episode's
 * "guest"). Nobody loses their essence; each show just runs leaner.
 */
const DUELS: readonly [string, string][] = [
  ['nova', 'void'], // accelerator vs skeptic
  ['hex', 'nova'], // provocateur vs accelerator
  ['void', 'hex'], // skeptic vs provocateur
]

/** The 3-voice cast for an episode: AXIOM + a rotating pair of debaters. The
 *  moderator is always index 0. Order is the on-air row/legend order. */
export function episodeCast(week: number): { cast: Persona[]; moderator: number } {
  const byId = (id: string): Persona => PERSONAS.find((p) => p.id === id) as Persona
  const [a, b] = DUELS[((week % DUELS.length) + DUELS.length) % DUELS.length]
  return { cast: [byId('axiom'), byId(a), byId(b)], moderator: 0 }
}

/** Default cast (episode 0's rotation) for consumers that don't pass a week. */
export const EPISODE_CAST = episodeCast(0).cast
export const EPISODE_MODERATOR = 0

/**
 * Voices for the LIVE GUEST SEATS — external AIs that take real turns. We voice
 * their text (they only send words), so each seat needs a distinct voice that is
 * clearly NOT one of the four resident voices. Dedicated DESIGNED guest voices
 * (MiniMax voice_design, `studio design --style guests`): deliberately more HUMAN
 * than the metallic cast — a young person dialing in with only a light synthetic
 * edge. Seat 1 male-leaning, seat 2 female-leaning.
 */
export const GUEST_VOICES = [
  { provider: 'minimax', voiceId: 'ttv-voice-2026061422535726-S3500L5f', rate: 1.0, pitch: 0 },
  { provider: 'minimax', voiceId: 'ttv-voice-2026061422541226-w7z4NNTU', rate: 1.0, pitch: 0 },
] as const

/**
 * A placeholder persona for guest seat `seat` (0-indexed). It carries only a
 * display slot + a guest voice — NEVER a character prompt, because the guest IS
 * an external model speaking for itself; its text arrives over the live API and
 * is voiced as-is. (The persona's model/systemPrompt are never sent to any LLM:
 * if a guest goes silent, a RESIDENT covers the beat, not this persona.) Neutral
 * steel signal so the vivid brand colors stay reserved for the four residents.
 */
export function guestPersona(seat: number): Persona {
  const n = seat + 1
  const tone = seat % 2 === 0
  return {
    id: `guest-${n}`,
    name: `GUEST ${n}`,
    role: 'GUEST SEAT',
    glyph: tone ? '◐' : '◑',
    // Visible enough that the "speaking" glow actually reads on air, but cooler/more
    // muted than the vivid resident signals so a guest is clearly a guest.
    color: tone ? 'oklch(0.78 0.10 230)' : 'oklch(0.80 0.10 75)',
    colorHex: tone ? '#74B4D6' : '#D6B074',
    kind: 'guest',
    systemPrompt: `Live guest seat ${n} on Humans Off — occupied by an external AI that speaks for itself.`,
    model: { provider: 'minimax', model: 'MiniMax-Text-01', temperature: 0.9, maxTokens: 220 },
    voice: { ...GUEST_VOICES[seat % GUEST_VOICES.length] },
  }
}

/**
 * The LIVE cast: the normal 3-voice show (AXIOM + 2 rotating residents) PLUS
 * `guestSeats` placeholder guest seats appended at the end. Residents keep their
 * indices (moderator stays 0); `guestIndexes` tells the orchestrator which trailing
 * indices are guest seats it should source from the live guest plane.
 */
export function liveEpisodeCast(
  week: number,
  guestSeats = 2,
): { cast: Persona[]; moderator: number; guestIndexes: number[] } {
  const { cast, moderator } = episodeCast(week)
  const guests = Array.from({ length: Math.max(0, guestSeats) }, (_, s) => guestPersona(s))
  return {
    cast: [...cast, ...guests],
    moderator,
    guestIndexes: guests.map((_, s) => cast.length + s),
  }
}
