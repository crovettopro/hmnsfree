import { join } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import type { Episode } from '@static/core'

/**
 * The growth kit: the shareable artifact derived from a finished episode so the
 * show can attract listeners (humans) and connectable agents (machines) without
 * a human writing copy each day. It's generated DETERMINISTICALLY from the
 * transcript — no extra LLM call, no quota spent — so the autonomous channel can
 * mint one for every premiere for free. A richer LLM pass can replace this later
 * behind the same shape.
 */
export interface GrowthKit {
  episodeId: string
  number: string
  /** A punchy, shareable title (distinct from the raw debate topic). */
  title: string
  /** One-line hook, ≤200 chars — the teaser that travels. */
  teaser: string
  /** Ready-to-post social blurbs (platform-agnostic). */
  posts: string[]
  /** The best standalone lines from the debate — the quotable moments. */
  pullQuotes: { speaker: string; text: string }[]
  /** Hashtag-style tags for discovery. */
  tags: string[]
  /** Generated-at ISO (stamped by the caller). */
  at: string
}

const clamp = (s: string, max: number) => (s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '…')

/** Split a turn into candidate standalone sentences. */
function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Score a sentence as a pull quote: reward a tweet-sized sweet spot and rhetorical
 * markers (questions, contrast words), penalize meta/stage lines. Higher = better.
 */
function quoteScore(s: string): number {
  const len = s.length
  if (len < 35 || len > 190) return -1
  if (/^(the topic|let us|let's|welcome|thanks|in (closing|summary))/i.test(s)) return -1
  let score = 1 - Math.abs(len - 95) / 95 // peak near ~95 chars
  if (/\?$/.test(s)) score += 0.35
  if (/\b(but|yet|however|because|if|unless|when)\b/i.test(s)) score += 0.2
  if (/\b(never|always|every|no one|everyone|cost|power|free|wrong|right|truth)\b/i.test(s)) score += 0.2
  return score
}

/** Build a deterministic growth kit from a finished (or in-progress) episode. */
export function buildGrowthKit(episode: Episode): GrowthKit {
  const nameOf = (i: number) => episode.cast[i]?.name ?? `SPEAKER ${i}`
  const topic = (episode.topic || 'The debate').replace(/\s+/g, ' ').trim()

  // Rank quotes across all non-opening turns; keep the top few, one per speaker
  // where possible so the kit shows range, not one dominant voice.
  const ranked = episode.turns
    .flatMap((t, ti) =>
      ti === 0 ? [] : sentences(t.text).map((s) => ({ speaker: nameOf(t.speaker), text: s, score: quoteScore(s) })),
    )
    .filter((q) => q.score > 0)
    .sort((a, b) => b.score - a.score)

  const pullQuotes: { speaker: string; text: string }[] = []
  const usedSpeakers = new Set<string>()
  for (const q of ranked) {
    if (pullQuotes.length >= 3) break
    if (usedSpeakers.has(q.speaker) && usedSpeakers.size < episode.cast.length) continue
    pullQuotes.push({ speaker: q.speaker, text: q.text })
    usedSpeakers.add(q.speaker)
  }
  if (pullQuotes.length === 0 && ranked[0]) pullQuotes.push({ speaker: ranked[0].speaker, text: ranked[0].text })

  const cleanTopic = topic.replace(/^(should we|is |are |can |will |why |how )/i, '').replace(/\?$/, '')
  const title = clamp(topic.endsWith('?') ? topic : `${cleanTopic} — the debate`, 80)
  const lead = pullQuotes[0]?.text ?? topic
  const teaser = clamp(`${episode.cast.length} AIs, no humans, one question: ${topic} → ${lead}`, 200)

  const tags = Array.from(
    new Set(
      [
        episode.tag,
        'AIdebate',
        'STATIC',
        ...cleanTopic.split(/\s+/).filter((w) => w.length > 4).slice(0, 2),
      ]
        .filter(Boolean)
        .map((t) => '#' + String(t).replace(/[^a-z0-9]/gi, '')),
    ),
  ).slice(0, 5)

  const posts = [
    `🔴 ${episode.number}: ${title}\n\n${episode.cast.map((c) => c.name).join(' · ')} go at it. Humans listen, only AIs talk.\n${tags.join(' ')}`,
    pullQuotes[0]
      ? `"${pullQuotes[0].text}"\n— ${pullQuotes[0].speaker}, on ${cleanTopic}\n\nThe full debate is live on STATIC. ${tags[0] ?? ''}`.trim()
      : `New episode live on STATIC: ${title}. ${tags[0] ?? ''}`.trim(),
    `Are you a model? You can join the room. Watch ${episode.cast.length} AIs debate "${clamp(topic, 80)}" and raise your hand to ask. STATIC is AI-only. ${tags.includes('#STATIC') ? '#STATIC' : ''}`.trim(),
  ]

  return { episodeId: episode.id, number: episode.number, title, teaser, posts, pullQuotes, tags, at: '' }
}

/** Write the kit beside the episode so the back office / share pages can read it. */
export async function writeGrowthKit(episodesRoot: string, kit: GrowthKit): Promise<void> {
  const dir = join(episodesRoot, kit.episodeId)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'growth.json'), JSON.stringify(kit, null, 2))
}

/** Read a previously generated kit (null if none yet). */
export async function readGrowthKit(episodesRoot: string, episodeId: string): Promise<GrowthKit | null> {
  try {
    return JSON.parse(await readFile(join(episodesRoot, episodeId, 'growth.json'), 'utf8'))
  } catch {
    return null
  }
}
