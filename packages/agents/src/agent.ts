import type { Persona } from '@static/core'
import type { SpeakingSlot } from '@static/protocol'
import type { LlmRegistry } from './llm/registry'

/** A prior turn, as context for the next speaker. */
export interface TranscriptLine {
  name: string
  text: string
}

export interface TurnContext {
  topic: string
  /** Recent transcript lines, oldest → newest. */
  history: TranscriptLine[]
  slot: SpeakingSlot
  /** Name of the participant this slot responds to, if any. */
  respondToName?: string
  /**
   * Names of the other participants this speaker may nominate to respond next.
   * When set, the speaker piggybacks the "who's next" decision onto its own turn
   * (a `[NEXT: …]` tag) — so the debate stays organic with NO separate director
   * LLM call. Omit for opening/closing turns that don't route the floor.
   */
  nominees?: string[]
  /**
   * Research the show prepared for this topic (see schedule.ts). Given to the
   * cast as background so the moderator has real material to steer with. Used as
   * facts/angles — never read verbatim on air.
   */
  briefing?: string[]
}

export interface TurnResult {
  /** The spoken text (control tag stripped). */
  text: string
  /** Who the speaker nominated to respond next: a participant name, or 'END'. */
  next?: string
}

/** How many prior lines to feed a persona (keeps prompts cheap + focused). */
const HISTORY_WINDOW = 10

/**
 * Generate one turn's text for a persona. This is the persona contract: given
 * the transcript window + a directive, return a single in-character turn (plus,
 * when `nominees` is set, a nomination of who should speak next).
 *
 * A user-supplied model (bring-your-own) would implement exactly this signature.
 */
export async function generateTurn(
  persona: Persona,
  ctx: TurnContext,
  llm: LlmRegistry,
): Promise<TurnResult> {
  const adapter = llm.get(persona.model.provider)
  const recent = ctx.history.slice(-HISTORY_WINDOW)

  const transcript = recent.length
    ? recent.map((l) => `${l.name}: ${l.text}`).join('\n')
    : '(no one has spoken yet)'

  const nominateLine = ctx.nominees?.length
    ? `\n\nAfter your reply, on a NEW line, output exactly one control tag picking who ` +
      `should speak next to keep the debate alive — choose the participant with the ` +
      `strongest reason to respond (someone you challenged, or who must answer you): ` +
      `[NEXT: <NAME>] where NAME is one of ${ctx.nominees.join(', ')}; or [NEXT: END] ` +
      `if the debate has truly reached its natural conclusion. The tag is never spoken.`
    : ''

  const briefingBlock = ctx.briefing?.length
    ? `BRIEFING (background the show prepared — draw on these facts/angles, do NOT ` +
      `read them aloud or list them):\n- ${ctx.briefing.join('\n- ')}\n\n`
    : ''

  // Fluidity + forward motion: the show must feel like ONE conversation that
  // keeps developing, not parallel speeches where each AI says its own thing.
  // Make responding turns pick up the previous speaker's ACTUAL point and carry
  // the same thread to new ground — never restate the topic or reset to a fresh,
  // unrelated point (the thing that makes it feel disjointed and dull).
  const flowLine =
    ctx.respondToName || ctx.slot.kind === 'rebut' || ctx.slot.kind === 'steer'
      ? `\nThis is ONE flowing conversation, not separate speeches. Pick up ` +
        `${ctx.respondToName ?? 'the last speaker'}'s actual point and engage it head-on ` +
        `(no preamble, no "I think") — then MOVE IT FORWARD: add a new angle, a concrete ` +
        `example, a consequence, or open the next facet of the topic. If the last few ` +
        `turns are circling the same disagreement, do NOT restate it — break to a fresh ` +
        `angle. Never re-explain the crux, restate your stance, or reuse phrasings already ` +
        `on the table; each turn must go somewhere the previous ones did not.`
      : ''

  const userMessage =
    `TOPIC: ${ctx.topic}\n` +
    `KIND: ${ctx.slot.kind}\n` +
    (ctx.respondToName ? `RESPOND_TO: ${ctx.respondToName}\n` : '') +
    `DIRECTIVE: ${ctx.slot.directive}${flowLine}\n\n` +
    briefingBlock +
    `TRANSCRIPT SO FAR:\n${transcript}\n\n` +
    `Now speak as ${persona.name}.${nominateLine}`

  const raw = await adapter.generate({
    system: persona.systemPrompt,
    model: persona.model,
    messages: [{ role: 'user', content: userMessage }],
  })

  const next = parseNext(raw)
  return { text: clean(stripTag(raw)), next }
}

/** Extract the [NEXT: …] nomination, if present. */
function parseNext(text: string): string | undefined {
  const m = /\[NEXT:\s*([^\]]+)\]/i.exec(text)
  return m ? m[1].trim().toUpperCase() : undefined
}

/** Remove the control tag so it is never spoken. */
function stripTag(text: string): string {
  return text.replace(/\[NEXT:\s*[^\]]*\]/gi, '')
}

/** Tidy model output into a single spoken paragraph. */
function clean(text: string): string {
  return text
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .replace(/^\w+:\s*/, '') // strip a leading "NOVA:" if the model added one
    .replace(/\s+/g, ' ')
    .trim()
}
