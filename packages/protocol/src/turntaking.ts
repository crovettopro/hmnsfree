import type { DirectiveKind } from './events'

/**
 * One scheduled chance to speak: who, what kind of contribution, and the
 * instruction handed to that persona. The orchestrator consumes a sequence of
 * these, asks the Agent Runtime to fill each with text, and stops on the
 * termination rules.
 */
export interface SpeakingSlot {
  /** Index into the episode cast. */
  speaker: number
  kind: DirectiveKind
  /** Instruction passed to the persona for this turn. */
  directive: string
  /** The cast index this slot is primarily reacting to, if any. */
  respondTo?: number
}

export interface DebatePlanConfig {
  /** Number of participants. */
  castSize: number
  /** Cast index that moderates (opens, steers, closes). */
  moderator: number
  /** How many full argue-rounds among the non-moderators. */
  rounds: number
  /** Insert a moderator steer between rounds. */
  moderatorSteers: boolean
  /** Each participant gives a closing statement at the end. */
  closingStatements: boolean
}

export const DEFAULT_PLAN: Omit<DebatePlanConfig, 'castSize' | 'moderator'> = {
  rounds: 2,
  moderatorSteers: true,
  closingStatements: true,
}

/**
 * v1 turn-taking: **moderated rounds**. Deterministic and easy to keep coherent.
 *
 *   open  → [round: each non-moderator argues] (× rounds, with optional steer)
 *         → closing statements → moderator closes.
 *
 * v2 ("floor requests") will replace the fixed order with agents bidding for the
 * floor between turns — but it produces the same `SpeakingSlot` stream, so the
 * orchestrator downstream never changes.
 */
export function planDebate(config: DebatePlanConfig): SpeakingSlot[] {
  const { castSize, moderator, rounds, moderatorSteers, closingStatements } = config
  const others = range(castSize).filter((i) => i !== moderator)
  const slots: SpeakingSlot[] = []

  // Opening — the moderator frames the question.
  slots.push({
    speaker: moderator,
    kind: 'open',
    directive:
      'Open the debate. State the topic crisply, define the key term in one line, ' +
      'and hand the floor to the others. Do not argue a side yet.',
  })

  for (let r = 0; r < rounds; r++) {
    others.forEach((speaker, idx) => {
      const prev = idx === 0 ? (r === 0 ? moderator : others[others.length - 1]) : others[idx - 1]
      slots.push({
        speaker,
        kind: r === 0 ? 'argue' : 'rebut',
        respondTo: prev,
        directive:
          r === 0
            ? 'Make your strongest case in character. Be terse and concrete. One sharp idea.'
            : 'Rebut the previous speakers from your stance. Push the disagreement forward, ' +
              'do not repeat earlier points.',
      })
    })
    if (moderatorSteers && r < rounds - 1) {
      slots.push({
        speaker: moderator,
        kind: 'steer',
        directive:
          'Briefly sharpen the disagreement: name the real crux the others are circling, ' +
          'then redirect to the next round. Stay neutral.',
      })
    }
  }

  if (closingStatements) {
    others.forEach((speaker) => {
      slots.push({
        speaker,
        kind: 'closing',
        directive: 'Give a one-line closing statement that lands your stance. Memorable, in character.',
      })
    })
  }

  // The moderator closes the show.
  slots.push({
    speaker: moderator,
    kind: 'closing',
    directive: 'Close the episode. Summarize the unresolved tension in a sentence and sign off. No winner.',
  })

  return slots
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i)
}
