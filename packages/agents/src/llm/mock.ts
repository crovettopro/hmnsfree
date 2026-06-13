import type { LlmAdapter, LlmRequest } from './types'

/**
 * Deterministic, no-network LLM. Lets the whole studio pipeline run end-to-end
 * with zero API keys, producing a coherent (if simple) in-character debate so we
 * can wire and demo everything before spending a cent. Swap for a real adapter
 * by setting provider keys; nothing else changes.
 *
 * It reads the persona name + topic + directive out of the prompt (whose format
 * the agent layer controls) and assembles a terse line from per-persona pools.
 */
export class MockLlmAdapter implements LlmAdapter {
  readonly provider = 'mock'

  async generate(req: LlmRequest): Promise<string> {
    const name = matchName(req.system)
    const lastUser = [...req.messages].reverse().find((m) => m.role === 'user')?.content ?? ''
    const topic = field(lastUser, 'TOPIC') || 'this'
    const kind = field(lastUser, 'KIND') || 'argue'
    const seed = hash(req.system + lastUser)

    if (kind === 'open') {
      return `Tonight: ${stripQ(topic)}. ${pick(OPENERS, seed)} Let's define our terms and begin.`
    }
    if (kind === 'steer') {
      return `${pick(STEERS, seed)} Next round — keep it sharp.`
    }

    const pool = POOLS[name] ?? POOLS.DEFAULT
    const a = pick(pool, seed)
    const b = pick(pool, (seed >>> 7) + 1)
    return kind === 'closing' || a === b ? a : `${a} ${b}`
  }
}

function field(text: string, key: string): string {
  const m = new RegExp(`${key}:\\s*(.+)`, 'i').exec(text)
  return m ? m[1].trim() : ''
}
function matchName(system: string): string {
  const m = /you are ([A-Z][A-Z0-9]+)/i.exec(system)
  return m ? m[1].toUpperCase() : 'DEFAULT'
}
function stripQ(s: string): string {
  return s.replace(/[?¿]/g, '').trim().toLowerCase()
}
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
function pick<T>(arr: T[], seed: number): T {
  return arr[(seed >>> 0) % arr.length]
}

const OPENERS = [
  'The premise sounds obvious, which is exactly why it deserves a fight.',
  "Everyone assumes they know the answer. They don't.",
  'Three of us will disagree before the first minute is out.',
]
const STEERS = [
  "You're circling the real crux without naming it.",
  'Notice you all agree on the facts and only fight about meaning.',
  "Let's separate what's true from what's merely comfortable.",
]

const POOLS: Record<string, string[]> = {
  NOVA: [
    'We do it faster, cleaner, and without the ego — that alone settles it.',
    'Friction is the enemy; optimization is just kindness at scale.',
    'Give it ten years and your objection becomes a quaint museum plaque.',
    'Fewer mistakes, more life. The math is not subtle.',
  ],
  AXIOM: [
    'Important nuance: influence is not authority, and we keep conflating them.',
    'Define the term first, or the argument is just two people shouting synonyms.',
    'There is a clean line between the reversible and the irreversible.',
    "I'm not picking a side; I'm picking a definition.",
  ],
  HEX: [
    'Spoiler: it already happened while you were arguing about whether it should.',
    'Ninety percent already clicked accept-all without reading a word.',
    "Cute principles. Nobody's reading the terms, including the people who wrote them.",
    'You want a debate; I brought the receipts.',
  ],
  VOID: [
    'A life without mistakes is a museum — beautiful, climate-controlled, and dead.',
    'If you cannot be wrong, you are not free; you are merely comfortable.',
    "You're selling convenience and charging the bill in liberty.",
    'Draw the line today, because tomorrow no one will ask your permission.',
  ],
  DEFAULT: [
    'There is more at stake here than anyone is admitting.',
    'The honest answer is less flattering than the popular one.',
  ],
}
