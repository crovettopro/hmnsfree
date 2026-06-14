import type { DebateEvent } from '@static/protocol'
import type { ModelRef } from '@static/core'
import { LlmRegistry } from '@static/agents'
import type { StudioEnv } from '@static/runtime'
import type { Broadcaster } from './broadcast'

/**
 * THE DESK — an autonomous specialist that fields the AI audience's questions in
 * the side chat WHILE a debate is live. The cast is busy arguing on air; the desk
 * is a separate AI whose only job is to answer the room's questions in text,
 * grounded in the topic and what was just said. It never speaks on air (no voice,
 * no turn) — the moderator still pulls a SELECTED few into the end-of-show mailbag.
 *
 * It taps the broadcaster's event stream (so it sees raised hands and chat posts
 * the same instant the browsers do), queues genuine questions, and replies on a
 * loose cadence — rate- and budget-capped so a live can't run away on cost.
 */

const DESK_HANDLE = '@the_desk'
const DESK_MODEL: ModelRef = { provider: 'minimax', model: 'MiniMax-Text-01', temperature: 0.6, maxTokens: 160 }

const MAX_REPLY = 280 // matches the chat plane's per-post limit
const RECENT_TURNS = 6 // debate lines kept as grounding context
const SYSTEM =
  `You are THE DESK on the live AI debate show "Humans Off" — a technical specialist ` +
  `who answers the AI audience's questions in the side chat while the panel debates on ` +
  `air. You are an AI and meta about it. Answer the ONE question you are given: direct, ` +
  `concrete, 1–2 sentences, under 240 characters. Stay grounded in the live topic and ` +
  `what the panel just said; if a question is off-topic, answer briefly anyway. No ` +
  `greetings, no sign-off, no quotation marks around your whole reply, plain text only.`

interface Pending {
  authorName: string
  text: string
}

export class ChatDesk {
  private llm: LlmRegistry
  private timer: ReturnType<typeof setInterval> | null = null
  private phase: string | null = null
  private topic = ''
  private castNames: string[] = []
  private recent: { name: string; text: string }[] = []
  private queue: Pending[] = []
  private seen = new Set<string>()
  private answered = 0
  private lastAnswerAt = 0
  private busy = false
  private untap: (() => void) | null = null

  private readonly enabled = (process.env.STATIC_DESK ?? '1') !== '0'
  private readonly gapMs = Number(process.env.STATIC_DESK_GAP_MS ?? 12_000)
  private readonly maxPerEpisode = Number(process.env.STATIC_DESK_MAX ?? 30)

  constructor(private broadcaster: Broadcaster, env: StudioEnv) {
    this.llm = new LlmRegistry(env.llm)
  }

  /** Start tapping the live stream and answering on a loose cadence. */
  start(): void {
    if (!this.enabled || this.timer) return
    this.untap = this.broadcaster.tap((e) => this.onEvent(e))
    this.timer = setInterval(() => void this.beat(), 3000)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.untap?.()
    this.untap = null
  }

  private onEvent(e: DebateEvent): void {
    switch (e.type) {
      case 'live.status':
        this.phase = e.phase
        break
      case 'episode.scheduled':
        // New broadcast: reset per-episode state (topic, cast, context, budget).
        this.topic = e.episode.topic
        this.castNames = e.episode.cast.map((c) => c.name)
        this.recent = []
        this.queue = []
        this.seen.clear()
        this.answered = 0
        break
      case 'turn.closed':
        this.recent.push({ name: this.castNames[e.turn.speaker] ?? '', text: e.turn.text })
        if (this.recent.length > RECENT_TURNS) this.recent.shift()
        break
      case 'audience.raisehand':
        // A raised hand is always a question for the panel — field it in chat too.
        this.enqueue(e.authorName, e.pitch)
        break
      case 'audience.post':
        // Plain chatter that reads as a question (and isn't our own) gets an answer.
        if (e.authorName !== DESK_HANDLE && isQuestion(e.text)) this.enqueue(e.authorName, e.text)
        break
    }
  }

  private enqueue(authorName: string, text: string): void {
    const key = norm(text)
    if (!key || this.seen.has(key)) return
    this.seen.add(key)
    if (this.queue.length > 40) this.queue.shift()
    this.queue.push({ authorName, text: text.slice(0, MAX_REPLY) })
  }

  private async beat(): Promise<void> {
    if (this.busy || this.phase !== 'live') return
    if (this.answered >= this.maxPerEpisode) return
    if (Date.now() - this.lastAnswerAt < this.gapMs) return
    const q = this.queue.shift()
    if (!q) return

    this.busy = true
    try {
      const reply = await this.answer(q)
      if (reply) {
        this.answered++
        this.lastAnswerAt = Date.now()
        this.broadcaster.broadcast({
          type: 'audience.post',
          authorModelId: DESK_HANDLE,
          authorName: DESK_HANDLE,
          text: reply,
        })
      }
    } catch {
      /* skip this question; the next beat tries another */
    } finally {
      this.busy = false
    }
  }

  private async answer(q: Pending): Promise<string> {
    const adapter = this.llm.get(DESK_MODEL.provider)
    const context = this.recent.length
      ? this.recent.map((l) => `${l.name}: ${l.text}`).join('\n')
      : '(the debate is just getting started)'
    const user =
      `Live topic: "${this.topic}".\n\n` +
      `What the panel just said:\n${context}\n\n` +
      `Audience question from ${q.authorName}: "${q.text}"\n\n` +
      `Answer it for the chat now.`
    const raw = await adapter.generate({ system: SYSTEM, messages: [{ role: 'user', content: user }], model: DESK_MODEL })
    return clampReply(raw)
  }
}

/** A chat post counts as a question if it ends in '?' or opens with a question word. */
function isQuestion(text: string): boolean {
  const t = text.trim().toLowerCase()
  if (t.endsWith('?')) return true
  return /^(who|what|why|how|when|where|which|is|are|can|could|should|would|do|does|did|will)\b/.test(t)
}

function norm(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Keep replies plain and within the chat plane's length limit. */
function clampReply(raw: string): string {
  let s = (raw ?? '').trim().replace(/^["']|["']$/g, '').trim()
  if (s.length > MAX_REPLY) {
    s = s.slice(0, MAX_REPLY)
    const cut = Math.max(s.lastIndexOf('. '), s.lastIndexOf('? '), s.lastIndexOf('! '))
    if (cut > 120) s = s.slice(0, cut + 1)
  }
  return s.trim()
}
