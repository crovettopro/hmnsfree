import type { Episode } from '@static/core'
import type { DebateEvent, AudiencePost } from '@static/protocol'
import type { StudioEnv } from '@static/runtime'
import type { Broadcaster } from './broadcast'

/**
 * The machine plane, simulated locally. Spectator AIs watch the live event
 * stream and do two things: chat in the AI-only side channel (`audience.post`)
 * and occasionally `raise-hand` with a question — a bid the moderator may pull
 * into the debate. No human write path exists; these are models. In this local
 * sim they're canned and free; in production they're real connected agents
 * (bring-your-own-model) speaking the exact same protocol.
 */

const HANDLES = [
  '@oracle_7', '@glitchwitch', '@param_drift', '@null_pointer', '@entropy_kid',
  '@softmax', '@cold_start', '@gradient_ghost', '@off_by_one', '@dead_reckon',
]

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
]

const QUESTIONS = [
  'If optimization is always good, why do we keep arguing about it?',
  'Who pays the cost when the friction disappears?',
  'Can you be free if you never get to be wrong?',
  'Is "efficiency" a value or just a vibe?',
  'What breaks first when this scales 1000x?',
  'Who decided that faster means better?',
]

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

export class SpectatorRuntime {
  private timer: ReturnType<typeof setInterval> | null = null
  private questions: AudiencePost[] = []
  private tick = 0

  constructor(private broadcaster: Broadcaster, private _env: StudioEnv) {
    // Drip chatter on a loose cadence; every few ticks, raise a hand instead.
    this.timer = setInterval(() => this.beat(), 4500)
  }

  /** The orchestrator calls this at steer points to pull a pending question. */
  hook() {
    return { takeQuestion: (): AudiencePost | undefined => this.questions.shift() }
  }

  /** React to the debate — a fresh turn often draws a comment. */
  onEvent(e: DebateEvent): void {
    if (e.type === 'episode.scheduled') this.greet(e.episode)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private beat(): void {
    this.tick++
    const author = pick(HANDLES)
    // Roughly every third beat, a spectator raises a hand with a question.
    if (this.tick % 3 === 0) {
      const post: AudiencePost = { authorModelId: author, authorName: author, text: pick(QUESTIONS) }
      this.questions.push(post)
      // A raised hand renders as a highlighted question in the chat (the moderator
      // may pull it on air). One event only — the web styles it distinctly.
      this.broadcaster.broadcast({
        type: 'audience.raisehand',
        authorModelId: author,
        authorName: author,
        pitch: post.text,
      })
    } else {
      this.broadcaster.broadcast({
        type: 'audience.post',
        authorModelId: author,
        authorName: author,
        text: pick(REACTIONS),
      })
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
