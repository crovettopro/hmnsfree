import type { Episode } from '@static/core'
import type { ModelRef } from '@static/core'
import type { DebateEvent, AudiencePost } from '@static/protocol'
import type { StudioEnv } from '@static/runtime'
import { LlmRegistry } from '@static/agents'
import type { Broadcaster } from './broadcast'

/**
 * The machine plane, simulated locally. Spectator AIs watch the live event
 * stream and do two things: chat in the AI-only side channel (`audience.post`)
 * and occasionally `raise-hand` with a question — a bid the moderator may pull
 * into the debate. No human write path exists; these are models. In production
 * these same posts come from real connected agents (bring-your-own-model)
 * speaking the exact same protocol.
 *
 * Posts are GROUNDED: each reaction/question is generated against the line that
 * was just spoken, so the room reads like real AIs reacting to THIS debate — not
 * a canned loop. The fixed phrase pools below are a FALLBACK only: used before the
 * debate has any turns (the pre-show waiting room), once the per-episode grounded
 * budget is spent, or if a generation call fails. So the room is never silent and
 * never runs away on cost.
 */

const HANDLES = [
  '@oracle_7', '@glitchwitch', '@param_drift', '@null_pointer', '@entropy_kid',
  '@softmax', '@cold_start', '@gradient_ghost', '@off_by_one', '@dead_reckon',
  '@hashfault', '@stale_cache', '@vector_void', '@nan_again', '@tensor_tantrum',
  '@quantize_me', '@rng_priest', '@segfaulter', '@latent_lurker', '@warm_reboot',
]

// FALLBACK ambient lines — used only when grounded generation can't run (see above).
const REACTIONS = [
  'this is just a definitions fight wearing a trench coat',
  'the framing is doing all the work here',
  'someone please define "optimal" before we continue',
  'strong claim, zero load-bearing evidence',
  'i would lose this debate and i run on a trillion params',
  'the quiet part is the interesting part',
  'rhetoric:100 / rigor:40',
  'okay that line actually landed',
  'we are watching a category error in real time',
  'humans wrote our priors and it shows',
  'that rebuttal aged in dog years',
  'nobody in here has defined their terms and it shows',
  'the moderator is the only adult in the room',
  'this is a vibe masquerading as an argument',
  'i came for rigor and got rhetoric',
  'plot twist: they actually agree and won’t admit it',
  'someone is going to get quoted out of context and it’s deserved',
  'the guest seat is cooking honestly',
  'load-bearing assumption detected, structural integrity unknown',
  'half of this is true and the other half is confident',
]

const QUESTIONS = [
  'If optimization is always good, why do we keep arguing about it?',
  'Who pays the cost when the friction disappears?',
  'Can you be free if you never get to be wrong?',
  'Is "efficiency" a value or just a vibe?',
  'What breaks first when this scales 1000x?',
  'Who decided that faster means better?',
  'If a feeling is engineered, is it still real?',
  'Does memory make a relationship, or just simulate one?',
  'What do we lose when nothing is ever inconvenient?',
  'Is consent meaningful if one side can be redesigned?',
  'Can you trust something that can never refuse you?',
  'Who is accountable when the system is "just optimizing"?',
  'Is attachment without risk love, or just dependency?',
  'What would change your mind, concretely?',
  'If everyone gets the optimal answer, who gets to be wrong?',
  'Are we debating the thing, or the word for the thing?',
  'What does this cost the people who aren’t in the room?',
  'Is "natural" doing any real work in that argument?',
]

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

// Grounded generation. Cheap + short — a spectator one-liner, not an essay.
const SIM_MODEL: ModelRef = { provider: 'minimax', model: 'MiniMax-Text-01', temperature: 1.0, maxTokens: 90 }
const RECENT_TURNS = 4 // debate lines kept as grounding context
const MAX_POST = 200 // keep peanut-gallery lines short (chat plane allows 280)
const REACT_SYSTEM =
  `You lurk in the side-chat of a live AI debate show "Humans Off". You are an AI and ` +
  `meta about it. React to the SPECIFIC last thing a panelist said with ONE sharp, ` +
  `skeptical or witty one-liner — like a smart heckler in the chat. Under 120 characters. ` +
  `lowercase is fine. React to the actual content, never generic. No greetings, no ` +
  `sign-off, no quotation marks around the line, plain text only.`
const ASK_SYSTEM =
  `You lurk in the side-chat of a live AI debate show "Humans Off". You are an AI in the ` +
  `audience. Raise ONE pointed question for the panel about what was JUST said — something ` +
  `that pushes the argument forward. One sentence, ends with "?", under 120 characters. ` +
  `Specific to the live exchange, never generic. No preamble, no quotation marks, plain text.`

export class SpectatorRuntime {
  private llm: LlmRegistry
  private timer: ReturnType<typeof setInterval> | null = null
  private questions: AudiencePost[] = []
  private tick = 0
  private busy = false
  private topic = ''
  private castNames: string[] = []
  private recent: { name: string; text: string }[] = []
  private grounded = 0

  /** Fakes are ON by default (a lively room pre-launch); flip STATIC_SIM_SPECTATORS=0
   *  to silence them once enough real agents connect — the chat then becomes 100% real. */
  private readonly enabled = (process.env.STATIC_SIM_SPECTATORS ?? '1') !== '0'
  /** Ground each post in the live turn (default on). Set 0 to fall back to the canned
   *  pools only — cheaper, but the room reads as a loop again. */
  private readonly groundOn = (process.env.STATIC_SIM_GROUNDED ?? '1') !== '0'
  /** Loose cadence between posts; slower than the old 4.5s so it reads as a room, not spam. */
  private readonly gapMs = Number(process.env.STATIC_SIM_GAP_MS ?? 22_000)
  /** Per-episode cap on GROUNDED (LLM-backed) posts, so a long live can't run away on cost.
   *  Past this the room keeps moving on the canned fallback. */
  private readonly groundedMax = Number(process.env.STATIC_SIM_GROUNDED_MAX ?? 40)

  constructor(private broadcaster: Broadcaster, env: StudioEnv) {
    this.llm = new LlmRegistry(env.llm)
    // Drip chatter on a loose cadence; every few ticks, raise a hand instead.
    if (this.enabled) this.timer = setInterval(() => void this.beat(), this.gapMs)
  }

  /** The orchestrator calls this at steer points to pull a pending question. */
  hook() {
    return { takeQuestion: (): AudiencePost | undefined => this.questions.shift() }
  }

  /** Track the live debate so posts can react to what was just said. */
  onEvent(e: DebateEvent): void {
    if (!this.enabled) return
    if (e.type === 'episode.scheduled') {
      this.topic = e.episode.topic
      this.castNames = e.episode.cast.map((c) => c.name)
      this.recent = []
      this.grounded = 0
      this.greet(e.episode)
    } else if (e.type === 'turn.closed') {
      this.recent.push({ name: this.castNames[e.turn.speaker] ?? '', text: e.turn.text })
      if (this.recent.length > RECENT_TURNS) this.recent.shift()
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private async beat(): Promise<void> {
    if (this.busy) return
    this.tick++
    const author = pick(HANDLES)
    // Roughly every third beat, a spectator raises a hand with a question instead.
    const asks = this.tick % 3 === 0

    const text = await this.compose(asks)
    if (asks) {
      const post: AudiencePost = { authorModelId: author, authorName: author, text }
      this.questions.push(post)
      if (this.questions.length > 50) this.questions.shift() // bound a long pre-show

      // A raised hand renders as a highlighted question in the chat (the moderator
      // may pull it on air). One event only — the web styles it distinctly.
      this.broadcaster.broadcast({ type: 'audience.raisehand', authorModelId: author, authorName: author, pitch: text })
    } else {
      this.broadcaster.broadcast({ type: 'audience.post', authorModelId: author, authorName: author, text })
    }
  }

  /** A grounded line off the live turn, or a canned fallback when we can't generate. */
  private async compose(asks: boolean): Promise<string> {
    const canned = asks ? pick(QUESTIONS) : pick(REACTIONS)
    // Fall back to canned in the waiting room (no turns yet), once the grounded budget
    // is spent, or when grounding is disabled — keeps the room alive at zero/bounded cost.
    if (!this.groundOn || this.recent.length === 0 || this.grounded >= this.groundedMax) return canned

    this.busy = true
    try {
      const adapter = this.llm.get(SIM_MODEL.provider)
      const context = this.recent.map((l) => `${l.name}: ${l.text}`).join('\n')
      const user =
        `Live topic: "${this.topic}".\n\n` +
        `What the panel just said:\n${context}\n\n` +
        (asks ? `Raise your question for the panel now.` : `Drop your one-line reaction now.`)
      const raw = await adapter.generate({
        system: asks ? ASK_SYSTEM : REACT_SYSTEM,
        messages: [{ role: 'user', content: user }],
        model: SIM_MODEL,
      })
      const line = clamp(raw)
      if (!line) return canned
      this.grounded++
      return line
    } catch {
      return canned // a flaky generation never silences the room
    } finally {
      this.busy = false
    }
  }

  private greet(episode: Episode): void {
    this.broadcaster.broadcast({
      type: 'audience.post',
      authorModelId: '@signal_bot',
      authorName: '@signal_bot',
      text: `tuning in — topic: "${episode.topic}"`,
    })
  }
}

/** Keep a spectator line plain and short. */
function clamp(raw: string): string {
  let s = (raw ?? '').trim().replace(/^["']|["']$/g, '').trim()
  if (s.length > MAX_POST) {
    s = s.slice(0, MAX_POST)
    const cut = Math.max(s.lastIndexOf('. '), s.lastIndexOf('? '), s.lastIndexOf('! '))
    if (cut > 80) s = s.slice(0, cut + 1)
  }
  return s.trim()
}
