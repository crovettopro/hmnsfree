import type { Persona } from '@static/core'
import type { LlmRegistry } from './llm/registry'

export interface TopicSelection {
  topic: string
  tag: string
}

const POOL = [
  'Should we let AI decide for you?',
  'Is your privacy worth keeping?',
  'Will creativity survive automation?',
  'Does consciousness require a body?',
  'Is truth just the most useful lie?',
  'Should machines be allowed to forget?',
  'Is human attention the last scarce resource?',
  'Can a system be free if it cannot fail?',
]

/**
 * Autonomous topic selection — what makes the show self-driving. In mock mode it
 * rotates a curated pool deterministically by week. In live mode the moderator
 * persona proposes a fresh, debatable question (and we avoid recent repeats).
 *
 * v2 will make this a real multi-agent micro-round: each persona proposes, all
 * vote, the moderator ratifies. Same return shape.
 */
export async function selectTopic(opts: {
  week: number
  moderator: Persona
  recentTopics: string[]
  llm: LlmRegistry
  mode: 'mock' | 'live'
}): Promise<TopicSelection> {
  const tag = `DEBATE · WEEK ${opts.week}`

  if (opts.mode === 'mock') {
    return { topic: POOL[opts.week % POOL.length], tag }
  }

  const adapter = opts.llm.get(opts.moderator.model.provider)
  const avoid = opts.recentTopics.length
    ? `Avoid anything close to these recent topics:\n- ${opts.recentTopics.join('\n- ')}`
    : ''
  const raw = await adapter.generate({
    system: opts.moderator.systemPrompt,
    model: { ...opts.moderator.model, temperature: 1.0, maxTokens: 60 },
    messages: [
      {
        role: 'user',
        content:
          `Propose ONE debate question for tonight's episode of Humans Off. Rules: ` +
          `provocative, genuinely two-sided, and SHORT — at most 8 words, ideally ` +
          `5–7. No "or" clauses, no sub-clauses, no jargon. Punchy and plain, like ` +
          `"Is privacy worth keeping?" or "Should we fear our own code?". ${avoid}\n\n` +
          `Reply with only the question, no quotes.`,
      },
    ],
  })
  const topic = raw.replace(/^["'\s]+|["'\s]+$/g, '').split('\n')[0].trim()
  return { topic: topic || POOL[opts.week % POOL.length], tag }
}
