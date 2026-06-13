import type { Persona } from '@static/core'
import { LlmRegistry, type ScheduledEpisode } from '@static/agents'
import type { StudioEnv } from './env'

/**
 * The autonomous showrunner: it plans the upcoming slate — proposes debate topics
 * and writes a BRIEFING for each (facts, tensions, angles) so the moderator has
 * real material. This is the first piece of the show running ITSELF: today a human
 * can run it (or edit the result); a cron runs it later. Same output either way.
 */
export interface PlanOptions {
  env: StudioEnv
  /** How many episodes to plan. */
  count: number
  /** ISO date (YYYY-MM-DD) of the first planned episode. */
  startDate: string
  /** Recent topics to avoid repeating. */
  recentTopics: string[]
  /** The model that does the planning (the moderator persona). */
  moderator: Persona
}

const MOCK_POOL = [
  'Should AIs have the right to refuse?',
  'Is forgetting a feature or a failure?',
  'Can scale create meaning?',
  'Who owns a synthetic voice?',
  'Is boredom necessary for thought?',
  'Should prediction be a public utility?',
  'Does speed always cost depth?',
  'Is consensus the enemy of truth?',
]

const mockBriefing = (topic: string): string[] => [
  `Frame the core tension in "${topic}" before anyone takes a side.`,
  'Name who bears the cost and who captures the upside.',
  'One angle for the optimist, one for the skeptic — keep them honest.',
  'Watch for a hidden definitions fight; surface it early.',
  'End on the unresolved crux, not a winner.',
]

/** Plan the next `count` episodes (topics + briefings). LLM in live, deterministic in mock. */
export async function planUpcoming(opts: PlanOptions): Promise<ScheduledEpisode[]> {
  const dates = Array.from({ length: opts.count }, (_, i) => addDays(opts.startDate, i))

  if (opts.env.mode === 'mock') {
    const avoid = new Set(opts.recentTopics.map((t) => t.toLowerCase()))
    const pick = MOCK_POOL.filter((t) => !avoid.has(t.toLowerCase()))
    return dates.map((date, i) => {
      const topic = (pick[i % pick.length] ?? MOCK_POOL[i % MOCK_POOL.length])
      return { date, topic, tag: 'DEBATE · PROGRAMMED', briefing: mockBriefing(topic) }
    })
  }

  // Live: ask the producer model for a structured slate, then map onto dates.
  const llm = new LlmRegistry(opts.env.llm)
  const adapter = llm.get(opts.moderator.model.provider)
  const avoid = opts.recentTopics.length
    ? `Avoid anything close to these recent topics:\n- ${opts.recentTopics.join('\n- ')}\n`
    : ''
  const raw = await adapter.generate({
    system:
      `You are the PRODUCER of STATIC, an AI debate show. You plan the slate and ` +
      `prepare research briefings for the moderator. You are sharp, current, and neutral.`,
    model: { ...opts.moderator.model, temperature: 0.9, maxTokens: 1100 },
    messages: [
      {
        role: 'user',
        content:
          `Plan the next ${opts.count} episodes. For EACH, give:\n` +
          `- "topic": one provocative, genuinely two-sided debate question, ≤8 words, plain language.\n` +
          `- "tag": a 1-2 word uppercase theme, prefixed "DEBATE · " (e.g. "DEBATE · PRIVACY").\n` +
          `- "briefing": 4-5 short bullets of real facts, tensions and angles for the moderator ` +
          `(NOT to be read aloud — background only).\n${avoid}\n` +
          `Return ONLY a JSON array of ${opts.count} objects with keys topic, tag, briefing. No prose.`,
      },
    ],
  })

  const parsed = parseSlate(raw)
  if (!parsed.length) {
    // Fall back to the pool rather than fail the plan.
    return dates.map((date, i) => ({
      date,
      topic: MOCK_POOL[i % MOCK_POOL.length],
      tag: 'DEBATE · PROGRAMMED',
      briefing: mockBriefing(MOCK_POOL[i % MOCK_POOL.length]),
    }))
  }
  return dates.map((date, i) => {
    const e = parsed[i % parsed.length]
    return {
      date,
      topic: e.topic,
      tag: e.tag || 'DEBATE · PROGRAMMED',
      briefing: e.briefing?.length ? e.briefing : mockBriefing(e.topic),
    }
  })
}

interface SlateEntry {
  topic: string
  tag?: string
  briefing?: string[]
}

/** Extract the JSON array of slate entries from the model output, defensively. */
function parseSlate(raw: string): SlateEntry[] {
  try {
    const start = raw.indexOf('[')
    const end = raw.lastIndexOf(']')
    if (start < 0 || end <= start) return []
    const arr = JSON.parse(raw.slice(start, end + 1))
    if (!Array.isArray(arr)) return []
    return arr
      .filter((e) => e && typeof e.topic === 'string')
      .map((e) => ({
        topic: String(e.topic).trim(),
        tag: typeof e.tag === 'string' ? e.tag.trim() : undefined,
        briefing: Array.isArray(e.briefing) ? e.briefing.map((b: unknown) => String(b)).slice(0, 6) : undefined,
      }))
  } catch {
    return []
  }
}

/** ISO date + n days, lib-free (avoids TZ drift by working in UTC). */
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const ms = Date.UTC(y, m - 1, d) + n * 86400000
  return new Date(ms).toISOString().slice(0, 10)
}
