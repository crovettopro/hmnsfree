import type { Episode } from '@static/core'
import { fmtTime } from '@static/core'

/**
 * Offline (no-LLM, zero-cost) quality pass over a finished episode. Two things
 * make a debate feel bad: one AI hogging the floor, and the cast repeating
 * itself. We measure both from the transcript alone so we catch it before a
 * human has to listen to 30 minutes.
 */

export interface SpeakerStat {
  name: string
  turns: number
  words: number
  speakingMs: number
  /** Fraction of total airtime. */
  share: number
}

export interface RepeatFlag {
  /** A content phrase that recurs. */
  phrase: string
  count: number
}

export interface SimilarPair {
  a: number
  b: number
  nameA: string
  nameB: string
  /** Jaccard similarity of the two turns' word sets, 0–1. */
  similarity: number
}

export interface QualityReport {
  speakers: SpeakerStat[]
  /** max share ÷ min share across speakers (1 = perfectly even). */
  balanceRatio: number
  avgWordsPerTurn: number
  repeats: RepeatFlag[]
  similarPairs: SimilarPair[]
  warnings: string[]
}

// Common words that shouldn't count toward "repetition" or content overlap.
const STOP = new Set(
  ('a an the and or but if then so of to in on at for with as is are was were be been ' +
    'it its this that these those i you he she they we me my your our their them us do does ' +
    'did not no yes can will would could should just like about into than too very more most ' +
    'what which who whom how why when where there here all any some such only own same other')
    .split(' '),
)

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

const contentWords = (s: string) => words(s).filter((w) => w.length > 2 && !STOP.has(w))

export function analyzeQuality(episode: Episode): QualityReport {
  const cast = episode.cast
  const turns = episode.turns
  const totalMs = turns.reduce((sum, t) => sum + t.durationMs, 0)

  // Per-speaker footprint.
  const speakers: SpeakerStat[] = cast.map((c, i) => {
    const mine = turns.filter((t) => t.speaker === i)
    const speakingMs = mine.reduce((s, t) => s + t.durationMs, 0)
    const wordCount = mine.reduce((s, t) => s + words(t.text).length, 0)
    return {
      name: c.name,
      turns: mine.length,
      words: wordCount,
      speakingMs,
      share: totalMs ? speakingMs / totalMs : 0,
    }
  })

  const spoke = speakers.filter((s) => s.turns > 0)
  const shares = spoke.map((s) => s.share)
  const balanceRatio = shares.length ? Math.max(...shares) / Math.max(1e-6, Math.min(...shares)) : 1
  const totalWords = speakers.reduce((s, x) => s + x.words, 0)
  const avgWordsPerTurn = turns.length ? totalWords / turns.length : 0

  // Repeated content trigrams across the whole episode.
  const tri = new Map<string, number>()
  for (const t of turns) {
    const cw = contentWords(t.text)
    for (let i = 0; i + 2 < cw.length; i++) {
      const key = `${cw[i]} ${cw[i + 1]} ${cw[i + 2]}`
      tri.set(key, (tri.get(key) ?? 0) + 1)
    }
  }
  const repeats: RepeatFlag[] = [...tri.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([phrase, count]) => ({ phrase, count }))

  // Near-duplicate turns (a speaker — or two — saying the same thing twice).
  const sets = turns.map((t) => new Set(contentWords(t.text)))
  const similarPairs: SimilarPair[] = []
  for (let a = 0; a < turns.length; a++) {
    for (let b = a + 1; b < turns.length; b++) {
      const sim = jaccard(sets[a], sets[b])
      if (sim >= 0.5) {
        similarPairs.push({
          a,
          b,
          nameA: cast[turns[a].speaker]?.name ?? '?',
          nameB: cast[turns[b].speaker]?.name ?? '?',
          similarity: sim,
        })
      }
    }
  }
  similarPairs.sort((x, y) => y.similarity - x.similarity)

  const warnings: string[] = []
  if (balanceRatio > 2.2) {
    const top = [...spoke].sort((a, b) => b.share - a.share)[0]
    warnings.push(`Unbalanced: ${top?.name} dominates (${Math.round((top?.share ?? 0) * 100)}% of airtime).`)
  }
  if (similarPairs.length) {
    warnings.push(`${similarPairs.length} near-duplicate turn pair(s) — the debate may be repeating itself.`)
  }
  if (avgWordsPerTurn < 14) {
    warnings.push(`Turns are short (avg ${avgWordsPerTurn.toFixed(0)} words) — could feel choppy.`)
  }

  return { speakers, balanceRatio, avgWordsPerTurn, repeats, similarPairs: similarPairs.slice(0, 5), warnings }
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const w of a) if (b.has(w)) inter++
  return inter / (a.size + b.size - inter)
}

/** Pretty-print the report for the studio console. */
export function reportQuality(report: QualityReport) {
  const lines: string[] = ['\n── quality ───────────────────────────']
  for (const s of report.speakers) {
    const bar = '█'.repeat(Math.round(s.share * 20)).padEnd(20, '·')
    lines.push(
      `  ${s.name.padEnd(7)} ${bar} ${String(Math.round(s.share * 100)).padStart(3)}%  ` +
        `${String(s.turns).padStart(2)} turns · ${fmtTime(s.speakingMs)}`,
    )
  }
  lines.push(`  balance ratio: ${report.balanceRatio.toFixed(2)}× (1.0 = even)`)
  lines.push(`  avg turn:      ${report.avgWordsPerTurn.toFixed(0)} words`)
  if (report.repeats.length) {
    lines.push(`  repeated phrases:`)
    for (const r of report.repeats) lines.push(`    ${r.count}×  “${r.phrase}”`)
  }
  if (report.similarPairs.length) {
    lines.push(`  near-duplicate turns:`)
    for (const p of report.similarPairs)
      lines.push(`    turns ${p.a}↔${p.b} (${p.nameA}/${p.nameB}) ${Math.round(p.similarity * 100)}% alike`)
  }
  if (report.warnings.length) {
    lines.push(`  ⚠ ${report.warnings.join('\n  ⚠ ')}`)
  } else {
    lines.push(`  ✓ no balance/repetition flags`)
  }
  lines.push('──────────────────────────────────────')
  console.log(lines.join('\n'))
}
