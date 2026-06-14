import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import type { Episode, Persona, Turn } from '@static/core'
import { toParticipant } from '@static/core'
import {
  LlmRegistry,
  generateTurn,
  selectTopic,
  type TranscriptLine,
  type ScheduledEpisode,
} from '@static/agents'
import { VoiceRegistry } from '@static/voice'
import type { SpeakingSlot, DebateEvent, DebateListener, AudiencePost } from '@static/protocol'
import type { StudioEnv } from './env'

/**
 * The machine plane's read side, as the orchestrator sees it: a source of
 * spectator-AI questions the moderator may pull into the debate. The live edge
 * implements this from connected agents; offline runs simply omit it.
 */
export interface AudienceHook {
  /** Take one pending spectator question for the moderator to bring on air. */
  takeQuestion(): AudiencePost | undefined
}

export interface ProduceOptions {
  env: StudioEnv
  personas: Persona[]
  moderator: number
  week: number
  number: string
  /** Directory for this episode's audio files. */
  audioDir: string
  /** URL prefix the web app will use to fetch the audio (e.g. /episodes/ep-027/audio). */
  audioUrlBase: string
  recentTopics?: string[]
  /** Minimum debate turns before the director may wind it down. */
  minTurns?: number
  /** Hard cap on debate turns (excludes opening + closings). */
  maxTurns?: number
  /**
   * Resume a partial episode that hit the quota wall: its topic + turns so far
   * are reused, topic-selection and the opening are skipped, and the debate
   * continues from where it stopped (then closings). Pass the SAME personas the
   * partial was produced with so speaker indices still line up.
   */
  resumeFrom?: Episode
  /**
   * Programmed episode from the editorial calendar: its topic/tag are used
   * (skipping autonomous selection) and its briefing is fed to every turn so the
   * moderator has prepared material. Omit to let the show pick its own topic.
   */
  planned?: ScheduledEpisode
  /** Machine plane: spectator-AI questions the moderator can pull on air (live). */
  audience?: AudienceHook
  /** Max audience questions in the dedicated end-of-show Q&A segment (default 2). */
  maxQuestions?: number
  /**
   * Broadcast clock: when true, the orchestrator waits each turn's playtime after
   * committing it, so the event stream unfolds in REAL TIME (a synchronized
   * premiere). The live edge sets this; the offline studio leaves it off so batch
   * production runs as fast as the APIs allow.
   */
  realtime?: boolean
  onEvent?: DebateListener
}

/** Rough spend per episode, for tracking quota/cost. */
export interface ProduceUsage {
  /** LLM generations: topic + director decisions + every turn. */
  llmCalls: number
  /** TTS generations (= number of turns). */
  ttsCalls: number
  /** Characters sent to TTS (the main TTS cost driver). */
  ttsCharacters: number
  /** Total audio produced, ms. */
  totalMs: number
}

export interface ProduceResult {
  episode: Episode
  usage: ProduceUsage
}

/**
 * Run one full episode: autonomous topic → opening → an ORGANIC debate whose
 * order is decided turn-by-turn by a director (not round-robin) → closings, with
 * per-turn TTS and an assembled Episode artifact. Pure orchestration: every
 * external call goes through an adapter registry, so this same function produces
 * a real episode (live keys) or a deterministic one (mock) with no code change.
 */
export async function produceEpisode(opts: ProduceOptions): Promise<ProduceResult> {
  const { env, personas, moderator } = opts
  const minTurns = opts.minTurns ?? 8
  const maxTurns = opts.maxTurns ?? 14
  const llm = new LlmRegistry(env.llm)
  const voices = new VoiceRegistry(env.voice)
  const emit = (e: DebateEvent) => opts.onEvent?.(e)
  const cast = personas.map(toParticipant)
  const usage: ProduceUsage = { llmCalls: 0, ttsCalls: 0, ttsCharacters: 0, totalMs: 0 }

  await mkdir(opts.audioDir, { recursive: true })

  const resume = opts.resumeFrom

  // 1) Topic — reuse the partial's on resume; else use the PROGRAMMED topic from
  //    the editorial calendar if one was handed in; else select autonomously.
  const briefing = resume ? undefined : opts.planned?.briefing
  let topic: string
  let tag: string
  if (resume) {
    topic = resume.topic
    tag = resume.tag
  } else if (opts.planned) {
    topic = opts.planned.topic
    tag = opts.planned.tag ?? `DEBATE · WEEK ${opts.week}`
  } else {
    const sel = await selectTopic({
      week: opts.week,
      moderator: personas[moderator],
      recentTopics: opts.recentTopics ?? [],
      llm,
      mode: env.mode,
    })
    topic = sel.topic
    tag = sel.tag
    if (env.mode === 'live') usage.llmCalls++ // topic selection asks the moderator's model
  }

  const episode: Episode = resume
    ? { ...resume, status: 'published' } // keep id/number/cast and the turns produced so far
    : {
        id: `ep-${opts.number.padStart(3, '0')}`,
        number: `EP.${opts.number.padStart(3, '0')}`,
        tag,
        topic,
        listeners: estimateListeners(opts.week),
        cast,
        turns: [],
        status: 'published',
      }

  const history: TranscriptLine[] = []
  let cursorMs = 0
  let index = 0
  if (resume) {
    // Seed state from the turns already on disk so the debate continues cleanly.
    for (const t of episode.turns) history.push({ name: personas[t.speaker].name, text: t.text })
    const last = episode.turns[episode.turns.length - 1]
    cursorMs = last ? last.startMs + last.durationMs : 0
    index = episode.turns.length
  }

  emit({ type: 'episode.scheduled', episode })
  emit({ type: 'episode.started', episodeId: episode.id, startedAtMs: cursorMs })

  const debaterNames = personas.filter((_, i) => i !== moderator).map((p) => p.name)

  // Generate one turn from a slot: text → voice → commit. Returns the speaker's
  // nomination for who goes next (only meaningful when `nominees` was passed).
  // Shared by every phase.
  const runTurn = async (slot: SpeakingSlot, nominees?: string[]): Promise<string | undefined> => {
    const persona = personas[slot.speaker]
    const turnId = `${episode.id}-t${String(index).padStart(2, '0')}`
    emit({ type: 'turn.opened', turnId, speaker: slot.speaker, directiveKind: slot.kind })

    const { text, next } = await generateTurn(
      persona,
      {
        topic,
        history,
        slot,
        respondToName: slot.respondTo != null ? personas[slot.respondTo].name : undefined,
        nominees,
        briefing,
      },
      llm,
    )
    usage.llmCalls++
    emit({ type: 'turn.text', turnId, text })

    const base = `t${String(index).padStart(2, '0')}-${persona.id}`
    const synth = await voices.get(persona.voice.provider).synthesize({
      text,
      voice: persona.voice,
      outPathBase: join(opts.audioDir, base),
    })
    const fileName = synth.filePath.slice(synth.filePath.lastIndexOf('/') + 1)
    const audioUrl = `${opts.audioUrlBase}/${fileName}`
    usage.ttsCalls++
    usage.ttsCharacters += text.length

    // Use the REAL clip length (the provider's reported length runs slightly
    // short, which made the player advance early and clip speakers). Probe it and
    // pad with a small gap so each voice fully finishes + a natural beat follows.
    const probed = await probeDurationMs(synth.filePath)
    const clipMs = Math.max(probed ?? 0, synth.durationMs)
    const slotMs = Math.round(clipMs + INTER_TURN_GAP_MS)
    emit({ type: 'turn.audio', turnId, url: audioUrl, durationMs: clipMs, wordTimings: synth.wordTimings })

    const turn: Turn = {
      id: turnId,
      speaker: slot.speaker,
      text,
      startMs: cursorMs,
      durationMs: slotMs,
      audio: { url: audioUrl, format: synth.format, durationMs: clipMs, wordTimings: synth.wordTimings },
    }
    episode.turns.push(turn)
    history.push({ name: persona.name, text })
    cursorMs += slotMs
    index++
    emit({ type: 'turn.closed', turn })
    // Broadcast clock: let this turn play out before producing the next, so a
    // live stream unfolds in real time (and spectator AIs have time to react).
    if (opts.realtime) await sleep(slotMs)
    return next
  }

  // Resolve a nomination (a name) to a DEBATER index (never the moderator, never
  // the same speaker twice in a row).
  const lastSpeaker = () => (history.length ? history[history.length - 1].name : '')
  const debaterIdx = personas.map((_, i) => i).filter((i) => i !== moderator)
  const countOf = (i: number) => history.reduce((n, h) => (h.name === personas[i].name ? n + 1 : n), 0)
  const resolveDebater = (nom: string | undefined): number => {
    // candidates = debaters who didn't just speak.
    const cands = debaterIdx.filter((i) => personas[i].name !== lastSpeaker())
    const pool = cands.length ? cands : debaterIdx

    // FAIRNESS GUARD: debaters nominate each other, which over a long run lets two
    // voices form a loop and starve a third (we saw NOVA get 1% of a 105-turn show).
    // If anyone has fallen ≥2 turns behind the busiest debater, force the most
    // starved (least turns, then least-recently-heard) to take the floor. This caps
    // the gap so the debate stays balanced while nominations still drive the flow.
    const maxC = Math.max(...debaterIdx.map(countOf))
    const starved = [...pool].sort((a, b) => countOf(a) - countOf(b) || lastHeard(a) - lastHeard(b))[0]
    if (starved !== undefined && maxC - countOf(starved) >= 2) return starved

    // Otherwise honor the nomination if it's a valid debater that didn't just speak.
    const want = (nom ?? '').toUpperCase()
    let idx = pool.find((i) => personas[i].name.toUpperCase() === want)
    if (idx === undefined) idx = pool.find((i) => want.includes(personas[i].name.toUpperCase()))
    if (idx !== undefined) return idx

    // Fallback: the debater who has spoken least recently.
    return [...pool].sort((a, b) => lastHeard(a) - lastHeard(b))[0] ?? (moderator + 1) % personas.length
  }
  // Index in history of a persona's last turn (-1 if never), for tie-breaking.
  const lastHeard = (i: number): number => {
    for (let h = history.length - 1; h >= 0; h--) if (history[h].name === personas[i].name) return h
    return -1
  }

  // 2) Opening — the moderator frames the question and hands to the first debater.
  //    Skipped on resume (the partial already has it); the debate just continues.
  let nomination: string | undefined
  if (!resume) {
    nomination = await runTurn(
      {
        speaker: moderator,
        kind: 'open',
        directive:
          'Open the debate. State the topic crisply, define the key term in one line, ' +
          'and hand the floor to one of the others. Do not argue a side yet.',
      },
      debaterNames,
    )
  }

  // 3) The debate proper — debaters nominate EACH OTHER (keeping the back-and-
  //    forth alive), and the moderator only steps in to steer every few turns.
  //    No separate director LLM call. Min/max turns guard the length.
  // Let the debaters run longer between moderator beats: frequent steering made
  // the moderator over-present and repetitive (it spoke every ~6 turns). Wider
  // cadence = longer, more fluid debater exchanges.
  const STEER_EVERY = 9
  let sinceSteer = 0
  for (let debateTurns = 0; debateTurns < maxTurns; debateTurns++) {
    const ended = (nomination ?? '').toUpperCase().startsWith('END')
    if (ended && debateTurns >= minTurns) break

    if (sinceSteer >= STEER_EVERY) {
      // Scheduled moderator beat. If a spectator AI raised a question, pull it on
      // air (the AI-only Q&A); otherwise steer the debate normally. Either way the
      // moderator hands the floor back to a debater.
      const question = opts.audience?.takeQuestion()
      nomination = await runTurn(
        question
          ? {
              speaker: moderator,
              kind: 'steer',
              directive:
                `A question just came in from the audience — ${question.authorName} asks: ` +
                `"${question.text}". Read it out as the moderator, then hand to one debater to answer it head-on.`,
            }
          : {
              speaker: moderator,
              kind: 'steer',
              directive:
                'Cut in for ONE beat: either pose a sharp, specific question that pushes the ' +
                'disagreement to NEW ground, or surface a fresh angle of the topic they have not ' +
                'touched yet — do NOT summarize or re-state "the crux"/"the real question". Then ' +
                'hand to one debater. Stay neutral, be brief.',
            },
        debaterNames,
      )
      sinceSteer = 0
      continue
    }

    const speaker = resolveDebater(ended ? undefined : nomination)
    // A debater nominates ANOTHER debater (not the moderator) to keep the duel going.
    const nominees = personas
      .filter((_, i) => i !== moderator && i !== speaker)
      .map((p) => p.name)
    nomination = await runTurn(
      {
        speaker,
        kind: 'rebut',
        directive: 'Respond to whoever provoked you. Push the disagreement forward; one sharp idea.',
      },
      nominees.length ? nominees : debaterNames,
    )
    sinceSteer++
  }

  // 3b) Audience Q&A segment — the moderator brings a few raised questions on air
  //     before closing (in addition to those pulled mid-debate). AI-only: the
  //     questions come from connected spectator models; humans only watch.
  if (opts.audience) {
    const maxQ = opts.maxQuestions ?? 2
    for (let q = 0; q < maxQ; q++) {
      const question = opts.audience.takeQuestion()
      if (!question) break
      const handoff = await runTurn(
        {
          speaker: moderator,
          kind: 'steer',
          directive:
            `Audience Q&A. Read this question from ${question.authorName}: "${question.text}". ` +
            `Frame it for the panel and hand to ONE debater to answer.`,
        },
        debaterNames,
      )
      const answerer = resolveDebater(handoff)
      await runTurn({
        speaker: answerer,
        kind: 'rebut',
        directive: 'Answer the audience question directly and in character. One sharp, concrete idea.',
      })
    }
  }

  // 4) Closings — each non-moderator lands their stance, moderator signs off.
  for (let i = 0; i < personas.length; i++) {
    if (i === moderator) continue
    await runTurn({
      speaker: i,
      kind: 'closing',
      directive: 'Give a one-line closing statement that lands your stance. Memorable, in character.',
    })
  }
  await runTurn({
    speaker: moderator,
    kind: 'closing',
    directive: 'Close the episode. Summarize the unresolved tension in a sentence and sign off. No winner.',
  })

  usage.totalMs = cursorMs
  emit({ type: 'episode.ended', episodeId: episode.id, totalMs: cursorMs })
  return { episode, usage }
}

/** A small silence between turns so voices don't run into each other. A real
 *  beat (not a clip) — keeps speakers from feeling like they cut each other off. */
const INTER_TURN_GAP_MS = 360

/** Lib-agnostic sleep (used only for the live broadcast clock). */
const sleep = (ms: number) =>
  new Promise<void>((r) =>
    (globalThis as unknown as { setTimeout: (f: () => void, ms: number) => void }).setTimeout(r, ms),
  )

/** Probe a clip's real duration via ffprobe (ms). Null if ffprobe is unavailable. */
function probeDurationMs(file: string): Promise<number | null> {
  return new Promise((resolve) => {
    const p = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      file,
    ])
    let out = ''
    p.stdout.on('data', (d) => (out += d))
    p.on('error', () => resolve(null))
    p.on('close', () => {
      const sec = parseFloat(out.trim())
      resolve(Number.isFinite(sec) ? Math.round(sec * 1000) : null)
    })
  })
}

/** Deterministic, plausible listener count from the week number. */
function estimateListeners(week: number): string {
  const n = 8000 + ((week * 1373) % 9000)
  return (n / 1000).toFixed(1) + 'K'
}
