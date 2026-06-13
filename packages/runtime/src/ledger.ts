import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import type { Episode } from '@static/core'
import { fmtTime } from '@static/core'
import type { ProduceUsage } from './orchestrator'

/**
 * A persistent record of what every produced episode cost. The console spend
 * report scrolls away; this file accumulates, so we can answer the only question
 * that matters before going daily: "how many episodes does my plan actually buy
 * per month?" — backed by real measured runs, not a guess.
 */

const __dirname = dirname(fileURLToPath(import.meta.url))
const LEDGER_PATH = join(__dirname, '../../../out/usage-ledger.json')

export interface LedgerEntry {
  id: string
  number: string
  /** ISO timestamp of when it was produced. */
  at: string
  turns: number
  audioMs: number
  llmCalls: number
  ttsCalls: number
  ttsCharacters: number
  /** Total requests = LLM + TTS calls (the 5h-block currency). */
  requests: number
  /** True if the run hit the wall and we saved a partial. */
  partial: boolean
}

/**
 * MiniMax plans, expressed as the only number that gates us: how many requests
 * fit in one rolling 5-hour block. These are ESTIMATES — the 17:00 limits test
 * will give us the real `requestsPerBlock`; update it here and projections sharpen.
 */
export interface Plan {
  name: string
  priceUsd: number
  requestsPerBlock: number
}
// Calibrated 2026-06-13 by the limits test: 211 requests measured ≈ 25% of the
// block (Eduardo's dashboard), and 822 requests in one block (EP.030 211 +
// EP.900 611) did NOT hit the wall — so the active plan holds ~840 req/block.
// Eduardo is on the $50 plan, so Max is the measured one; Plus is still an
// estimate pending its own test.
export const PLANS: Plan[] = [
  { name: 'Plus', priceUsd: 20, requestsPerBlock: 340 }, // estimate (not yet measured)
  { name: 'Max', priceUsd: 50, requestsPerBlock: 840 }, // measured: ~840/block
]

async function readLedger(): Promise<LedgerEntry[]> {
  try {
    return JSON.parse(await readFile(LEDGER_PATH, 'utf8')).entries ?? []
  } catch {
    return []
  }
}

/** Public read of the accumulated ledger entries (for the back office API). */
export async function readLedgerEntries(): Promise<LedgerEntry[]> {
  return readLedger()
}

export interface LedgerProjection {
  episodes: number
  avgRequests: number
  avgMinutes: number
  avgTtsChars: number
  requestsPerAudioMin: number
  totalRequests: number
  totalMinutes: number
  plans: { name: string; priceUsd: number; episodesPerBlock: number; minutesPerBlock: number; episodesPerMonth: number }[]
}

/**
 * Turn the raw ledger into the headline numbers the back office shows: averages
 * per episode and, per plan, how many episodes a 5-hour block actually buys.
 * Same math as the console report, returned as data instead of printed.
 */
export function projectLedger(entries: LedgerEntry[]): LedgerProjection | null {
  const n = entries.length
  if (!n) return null
  const sum = (f: (e: LedgerEntry) => number) => entries.reduce((s, e) => s + f(e), 0)
  const avgRequests = sum((e) => e.requests) / n
  const avgMinutes = sum((e) => e.audioMs) / n / 60000
  const avgTtsChars = sum((e) => e.ttsCharacters) / n
  const totalMinutes = sum((e) => e.audioMs) / 60000
  const requestsPerAudioMin = sum((e) => e.requests) / Math.max(1, totalMinutes)
  return {
    episodes: n,
    avgRequests,
    avgMinutes,
    avgTtsChars,
    requestsPerAudioMin,
    totalRequests: sum((e) => e.requests),
    totalMinutes,
    plans: PLANS.map((plan) => {
      const episodesPerBlock = plan.requestsPerBlock / Math.max(1, avgRequests)
      return {
        name: plan.name,
        priceUsd: plan.priceUsd,
        episodesPerBlock,
        minutesPerBlock: episodesPerBlock * avgMinutes,
        episodesPerMonth: episodesPerBlock * 30,
      }
    }),
  }
}

/**
 * Append one produced episode to the ledger (creates the file on first run).
 * Re-runs of the same id overwrite. When `mergeWithPrior` (a resume completing a
 * partial), the cost across runs is summed so the entry reflects the FULL spend
 * to produce that episode — turns/audioMs come from the now-complete episode.
 */
export async function appendLedger(
  episode: Episode,
  usage: Pick<ProduceUsage, 'llmCalls' | 'ttsCalls' | 'ttsCharacters' | 'totalMs'>,
  partial: boolean,
  at: string,
  mergeWithPrior = false,
): Promise<void> {
  const entries = await readLedger()
  const prior = mergeWithPrior ? entries.find((e) => e.id === episode.id) : undefined
  const llmCalls = usage.llmCalls + (prior?.llmCalls ?? 0)
  const ttsCalls = usage.ttsCalls + (prior?.ttsCalls ?? 0)
  const ttsCharacters = usage.ttsCharacters + (prior?.ttsCharacters ?? 0)
  const entry: LedgerEntry = {
    id: episode.id,
    number: episode.number,
    at,
    turns: episode.turns.length,
    audioMs: usage.totalMs,
    llmCalls,
    ttsCalls,
    ttsCharacters,
    requests: llmCalls + ttsCalls,
    partial,
  }
  const next = [...entries.filter((e) => e.id !== entry.id), entry]
  await mkdir(dirname(LEDGER_PATH), { recursive: true })
  await writeFile(LEDGER_PATH, JSON.stringify({ entries: next }, null, 2))
}

/** Print the accumulated ledger + a plan projection. */
export async function summarizeLedger(): Promise<void> {
  const entries = await readLedger()
  if (!entries.length) {
    console.log('No usage recorded yet. Produce an episode first (pnpm --filter @static/studio produce).')
    return
  }

  const n = entries.length
  const sum = (f: (e: LedgerEntry) => number) => entries.reduce((s, e) => s + f(e), 0)
  const avgReq = sum((e) => e.requests) / n
  const avgMin = sum((e) => e.audioMs) / n / 60000
  const avgChars = sum((e) => e.ttsCharacters) / n
  const reqPerMin = sum((e) => e.requests) / Math.max(1, sum((e) => e.audioMs) / 60000)

  console.log(`\n══ STATIC usage ledger ══════════════════════════`)
  console.log(`  ${n} episode(s) recorded · out/usage-ledger.json\n`)
  for (const e of entries.slice(-10)) {
    console.log(
      `  ${e.number.padEnd(7)} ${fmtTime(e.audioMs).padStart(6)} · ` +
        `${String(e.turns).padStart(3)} turns · ${String(e.requests).padStart(4)} req` +
        `${e.partial ? '  (partial)' : ''}`,
    )
  }
  console.log(
    `\n  averages: ${avgMin.toFixed(1)} min · ${avgReq.toFixed(0)} req/episode · ` +
      `${reqPerMin.toFixed(1)} req per audio-min · ${Math.round(avgChars).toLocaleString()} TTS chars`,
  )

  console.log(`\n── projection (1 block/day cadence) ─────────────`)
  console.log(`  (calibrate requestsPerBlock from the limits test; edit PLANS in ledger.ts)\n`)
  for (const plan of PLANS) {
    const perBlock = plan.requestsPerBlock / Math.max(1, avgReq)
    const perMonth = perBlock * 30
    const minutesPerBlock = perBlock * avgMin
    console.log(
      `  ${plan.name.padEnd(5)} ($${plan.priceUsd}/mo): ~${perBlock.toFixed(1)} episodes/block ` +
        `(~${minutesPerBlock.toFixed(0)} min) · ~${perMonth.toFixed(0)} episodes/month`,
    )
  }
  console.log(`──────────────────────────────────────────────────\n`)
}
