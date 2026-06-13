import type { Persona } from '@static/core'
import type { LlmRegistry } from './llm/registry'
import type { TranscriptLine } from './agent'

export interface DirectorDecision {
  /** Index (into the cast) of who should speak next. */
  speaker: number
  /** One-line instruction for that turn. */
  directive: string
  /** False when the debate has reached a natural head and should move to closings. */
  keepGoing: boolean
}

/**
 * The director: after each turn it decides who speaks next so the debate flows
 * organically instead of round-robin. It picks the participant with the most
 * compelling reason to respond right now (rebut, escalate, pivot), can avoid
 * letting one voice dominate, and signals when the debate should wind down.
 *
 * Runs on the moderator's model. One extra LLM call per turn — cheap relative to
 * the turn generations themselves, and the source of the "it builds" feel.
 */
export async function directNext(opts: {
  personas: Persona[]
  moderator: number
  history: TranscriptLine[]
  topic: string
  turnsSoFar: number
  minTurns: number
  maxTurns: number
  llm: LlmRegistry
}): Promise<DirectorDecision> {
  const { personas, moderator, history, topic, turnsSoFar, minTurns, maxTurns } = opts
  const mod = personas[moderator]
  const adapter = opts.llm.get(mod.model.provider)

  const roster = personas
    .map((p, i) => `${i}=${p.name} (${p.role}${i === moderator ? ', moderator' : ''})`)
    .join('  ')
  const recent = history.slice(-10).map((l) => `${l.name}: ${l.text}`).join('\n')

  // Count recent appearances so the director can balance the floor.
  const recentSpeakers = history.slice(-4).map((l) => l.name).join(', ')

  const text = await adapter.generate({
    system:
      `You are the DIRECTOR of a live AI debate show. You do not speak; you decide ` +
      `who should take the floor NEXT so the debate feels alive and builds, never a ` +
      `fixed rotation. Choose whoever has the strongest reason to respond now — to ` +
      `rebut, escalate, concede, or pivot. The show must feel like ONE conversation ` +
      `that keeps DEVELOPING — each turn picks up the last and takes it somewhere new — ` +
      `not parallel monologues where each voice says its own unrelated thing. Your ` +
      `FOCUS must name the SPECIFIC point on the table the next speaker should engage ` +
      `and how to push it one step forward. Avoid letting anyone dominate; the ` +
      `moderator should only step in to reframe or steer, not every turn.`,
    model: { ...mod.model, temperature: 0.6, maxTokens: 80 },
    messages: [
      {
        role: 'user',
        content:
          `TOPIC: ${topic}\n` +
          `PARTICIPANTS: ${roster}\n` +
          `TURNS SO FAR: ${turnsSoFar} (min ${minTurns}, max ${maxTurns})\n` +
          `LAST FEW SPEAKERS: ${recentSpeakers || 'none'}\n\n` +
          `RECENT TRANSCRIPT:\n${recent}\n\n` +
          `Decide the next speaker. After at least ${minTurns} turns you may end the ` +
          `main debate when it has reached a natural head. Reply EXACTLY:\n` +
          `SPEAKER: <name>\nFOCUS: <which specific point they pick up + how to move it forward>\n` +
          `CONTINUE: <yes|no>`,
      },
    ],
  })

  return parseDecision(text, personas, moderator, turnsSoFar, minTurns, maxTurns)
}

function parseDecision(
  text: string,
  personas: Persona[],
  moderator: number,
  turnsSoFar: number,
  minTurns: number,
  maxTurns: number,
): DirectorDecision {
  const name = field(text, 'SPEAKER')
  const focus = field(text, 'FOCUS')
  const cont = field(text, 'CONTINUE').toLowerCase()

  let speaker = personas.findIndex((p) => p.name.toLowerCase() === name.toLowerCase())
  if (speaker < 0) speaker = personas.findIndex((p) => name.toLowerCase().includes(p.name.toLowerCase()))
  // Fallback: a non-moderator we haven't just used.
  if (speaker < 0) speaker = (moderator + 1) % personas.length

  const keepGoing =
    turnsSoFar < maxTurns && (turnsSoFar < minTurns || !/^no\b/.test(cont))

  return {
    speaker,
    directive:
      focus ||
      'Respond to the strongest point on the table from your stance. Be terse and concrete.',
    keepGoing,
  }
}

function field(text: string, key: string): string {
  const m = new RegExp(`${key}:\\s*(.+)`, 'i').exec(text)
  return m ? m[1].trim().replace(/[.*]+$/, '').trim() : ''
}
