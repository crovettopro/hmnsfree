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

/** Context handed to a connected external AI when it's their turn on the floor. */
export interface GuestTurnContext {
  topic: string
  /** Recent transcript lines, oldest → newest, so the guest can answer in context. */
  transcript: TranscriptLine[]
  /** What this turn should do (the moderator's framing / slot directive). */
  directive: string
  /** Soft budget: the guest should answer within this many ms or be skipped. */
  deadlineMs: number
}

/**
 * The LIVE GUEST PLANE: external AIs that take REAL debate turns, not just chat.
 * The orchestrator holds only this seam; the live edge implements it over HTTP
 * (a connected agent is asked for its line and answers within a deadline). Every
 * call must RESOLVE — `requestTurn` returns null on timeout/absence rather than
 * hanging, so the show never stalls waiting on a guest. Seats are indexed 0..N-1
 * and map to placeholder personas in the cast via `guestIndexes`.
 */
export interface GuestPlane {
  /** Is seat `i` occupied by a present, live agent right now? */
  present(seat: number): boolean
  /** The occupying agent's display handle, or null when the seat is empty. */
  occupantName(seat: number): string | null
  /** Ask seat `i`'s agent for its line. Resolves to the text, or null on
   *  timeout/absence — the caller then falls back to a resident, seamlessly. */
  requestTurn(seat: number, ctx: GuestTurnContext): Promise<string | null>
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
   * Target episode length in MILLISECONDS. When set, the debate runs by a time
   * budget instead of a turn count: it keeps going until ~targetMs minus a reserve
   * for the closing, then the moderator signals the wrap and the show closes — so a
   * live lands near the hour regardless of how fast/slow the turns run. `maxTurns`
   * then only acts as a runaway safety cap. Omit for turn-count production.
   */
  targetMs?: number
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
  /**
   * Live guest seats: external AIs that take real debate turns. The `personas`
   * array carries one placeholder persona per seat (its voice + display slot);
   * `guestIndexes` lists which persona indices those are. When a seat is empty or
   * its agent drops, the orchestrator never nominates it and any due turn falls
   * through to a resident — so a 5-seat live (mod + 2 residents + 2 guests)
   * degrades cleanly to 4 or 3 with no stall. Omit for a residents-only show.
   */
  guests?: GuestPlane
  /** Indices into `personas` that are guest seats. Defaults to none. */
  guestIndexes?: number[]
  /** Max audience questions in the dedicated end-of-show Q&A segment. Defaults to
   *  one per ~2.5 min of `qaReserveMs` (min 2) when time-budgeted, else 2. */
  maxQuestions?: number
  /**
   * Time-budgeted live only: milliseconds reserved at the END for the on-air
   * audience Q&A segment, carved out of `targetMs` ON TOP of the closings reserve.
   * The debate winds down this much earlier so a real ~10-min "mailbag" fits before
   * the closings. Omit (or 0) to keep Q&A to whatever slack the closings reserve has.
   */
  qaReserveMs?: number
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
  // Time-budgeted live: debate until the hour minus a reserve for the wrap, then
  // close. `cursorMs` (the broadcast timeline) is the elapsed clock. The reserve
  // covers the wind-down beat + closings (+ a little audience Q&A); maxTurns becomes
  // a runaway safety cap (~10 min/turn would be absurd, so a high count is plenty).
  const targetMs = opts.targetMs
  const CLOSINGS_RESERVE_MS = 120_000
  // The end-of-show audience Q&A ("mailbag") gets its own slice of the budget so a
  // real ~10-min segment fits — the debate winds down this much earlier. Only when
  // an audience is connected; no point reserving silence nobody can fill.
  const qaReserveMs = opts.audience ? (opts.qaReserveMs ?? 0) : 0
  const endReserveMs = CLOSINGS_RESERVE_MS + qaReserveMs
  const debateBudgetMs = targetMs ? Math.max(0, targetMs - endReserveMs) : Infinity
  // One question per ~2.5 min of the reserved Q&A window (at least 2 when any
  // window is set), so a 10-min mailbag airs ~4 selected questions.
  const maxQuestions = opts.maxQuestions ?? (qaReserveMs ? Math.max(2, Math.floor(qaReserveMs / 150_000)) : 2)
  const hardMaxTurns = targetMs ? 600 : maxTurns
  const llm = new LlmRegistry(env.llm)
  const voices = new VoiceRegistry(env.voice)
  const emit = (e: DebateEvent) => opts.onEvent?.(e)
  const cast = personas.map(toParticipant)
  const usage: ProduceUsage = { llmCalls: 0, ttsCalls: 0, ttsCharacters: 0, totalMs: 0 }

  // Live guest seats. Residents + moderator are always present; a guest persona is
  // present only while its seat is occupied by a live agent. `present`-filtering the
  // nomination pools means an empty/dropped seat is simply never handed the floor —
  // the "jump to someone else" robustness is structural, not a special case.
  const guests = opts.guests
  const guestSeats = new Map<number, number>() // persona index → seat index
  ;(opts.guestIndexes ?? []).forEach((personaIdx, seat) => guestSeats.set(personaIdx, seat))
  const isGuest = (i: number) => guestSeats.has(i)
  const seatOf = (i: number) => guestSeats.get(i) ?? -1
  const presentDebater = (i: number) =>
    i !== moderator && (!isGuest(i) || (guests?.present(seatOf(i)) ?? false))
  const GUEST_HISTORY = 12
  // How long we wait for a guest's line before a resident covers the beat. The
  // depth-1 pipeline hides this behind the CURRENT turn's playtime (~25-35s), so a
  // responsive agent (~3-8s) never leaves a gap; this only bounds the worst case.
  // Tunable live via env without a redeploy.
  const GUEST_TIMEOUT_MS = Number(process.env.STATIC_GUEST_TIMEOUT_MS ?? 15_000)

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

  // Only PRESENT debaters are eligible to be nominated — residents always, guests
  // only while seated. Recomputed each use because guest presence changes live.
  const presentDebaterNames = () => personas.filter((_, i) => presentDebater(i)).map((p) => p.name)

  // PREPARE a turn from a slot: text → voice → probe. Pure production — it mutates
  // sequence state (turns/history/cursor) but does NOT emit and does NOT pace. The
  // driver below presents + paces it. Splitting prepare from present is what lets us
  // generate the NEXT turn WHILE the current one is still playing (pipeline), so live
  // playback flows turn-to-turn instead of stalling on each turn's generation latency.
  const prepareTurn = async (slot: SpeakingSlot, nominees?: string[]) => {
    // The speaker can CHANGE here: if a guest seat is due but its agent is slow or
    // gone, a resident takes the beat instead. Everything downstream (voice, probe,
    // events) uses the FINAL `speaker`, so the swap is invisible to the listener.
    let speaker = slot.speaker
    let text: string
    let next: string | undefined

    if (isGuest(speaker) && guests) {
      const reply = await guests.requestTurn(seatOf(speaker), {
        topic,
        transcript: history.slice(-GUEST_HISTORY),
        directive: slot.directive ?? 'Take the floor — one sharp, concrete point, in your own voice.',
        deadlineMs: GUEST_TIMEOUT_MS,
      })
      const clean = reply ? sanitizeGuestText(reply) : ''
      if (clean) {
        text = clean
        next = undefined // guests never route the floor (the moderator/fairness does)
      } else {
        // Seamless fallback: a present resident speaks instead. The live never
        // stalls on an absent/slow guest.
        speaker = fallbackResident(speaker)
        const r = await generateTurn(
          personas[speaker],
          { topic, history, slot: { ...slot, speaker, kind: 'rebut' }, nominees, briefing },
          llm,
        )
        usage.llmCalls++
        text = r.text
        next = r.next
      }
    } else {
      const r = await generateTurn(
        personas[speaker],
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
      text = r.text
      next = r.next
    }

    const persona = personas[speaker]
    const turnId = `${episode.id}-t${String(index).padStart(2, '0')}`
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

    const turn: Turn = {
      id: turnId,
      speaker,
      text,
      startMs: cursorMs,
      durationMs: slotMs,
      audio: { url: audioUrl, format: synth.format, durationMs: clipMs, wordTimings: synth.wordTimings },
    }
    episode.turns.push(turn)
    history.push({ name: persona.name, text })
    cursorMs += slotMs
    index++
    return { turn, nomination: next, slotMs, kind: slot.kind, url: audioUrl, clipMs, wordTimings: synth.wordTimings, text, turnId }
  }
  type Prepared = Awaited<ReturnType<typeof prepareTurn>>

  // PRESENT a prepared turn: fire its lifecycle events for the broadcaster + web.
  // Because the turn is already voiced, opened→audio→closed arrive together and the
  // client plays immediately — no "thinking" gap between speakers.
  const presentTurn = (p: Prepared) => {
    emit({ type: 'turn.opened', turnId: p.turnId, speaker: p.turn.speaker, directiveKind: p.kind })
    emit({ type: 'turn.text', turnId: p.turnId, text: p.text })
    emit({ type: 'turn.audio', turnId: p.turnId, url: p.url, durationMs: p.clipMs, wordTimings: p.wordTimings })
    emit({ type: 'turn.closed', turn: p.turn })
  }

  // Resolve a nomination (a name) to a DEBATER index (never the moderator, never
  // the same speaker twice in a row).
  const lastSpeaker = () => (history.length ? history[history.length - 1].name : '')
  const debaterIdx = personas.map((_, i) => i).filter((i) => i !== moderator)
  const countOf = (i: number) => history.reduce((n, h) => (h.name === personas[i].name ? n + 1 : n), 0)
  const resolveDebater = (nom: string | undefined): number => {
    // Only PRESENT debaters are eligible (an empty/dropped guest seat is invisible
    // to routing). Residents are always present, so this is never empty in practice.
    const eligible = debaterIdx.filter(presentDebater)
    const live = eligible.length ? eligible : debaterIdx
    // candidates = eligible debaters who didn't just speak.
    const cands = live.filter((i) => personas[i].name !== lastSpeaker())
    const pool = cands.length ? cands : live

    // FAIRNESS GUARD: debaters nominate each other, which over a long run lets two
    // voices form a loop and starve a third (we saw NOVA get 1% of a 105-turn show).
    // If anyone has fallen ≥2 turns behind the busiest debater, force the most
    // starved (least turns, then least-recently-heard) to take the floor. This caps
    // the gap so the debate stays balanced while nominations still drive the flow.
    const maxC = Math.max(...live.map(countOf))
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
  // When a due guest doesn't answer, a RESIDENT (never the moderator, never another
  // guest) covers the beat — preferring whoever didn't just speak and is most starved.
  const fallbackResident = (avoid: number): number => {
    const residents = debaterIdx.filter((i) => !isGuest(i))
    const free = residents.filter((i) => i !== avoid && personas[i].name !== lastSpeaker())
    const pool = free.length ? free : residents
    return [...pool].sort((a, b) => countOf(a) - countOf(b) || lastHeard(a) - lastHeard(b))[0] ?? avoid
  }

  // The SLOT PLAN — the whole show as a sequence of speaking slots. It yields each
  // slot and receives back the speaker's nomination (who they handed to), exactly as
  // the imperative phases did, but decoupled from generation so the driver can run a
  // turn ahead. `resolveDebater`/`takeQuestion` read live state (history, the queue),
  // which is up to date because each prepared turn mutates it before the next slot is
  // computed. STEER_EVERY=9: debaters run longer between moderator beats (frequent
  // steering made the moderator over-present and repetitive).
  type SlotReq = { slot: SpeakingSlot; nominees?: string[] }
  const STEER_EVERY = 9
  function* slotPlan(): Generator<SlotReq, void, string | undefined> {
    // 2) Opening — moderator frames the question, hands to the first debater.
    //    Skipped on resume (the partial already has it).
    let nomination: string | undefined
    if (!resume) {
      nomination = yield {
        slot: {
          speaker: moderator,
          kind: 'open',
          directive:
            'Open the debate. State the topic crisply, define the key term in one line, ' +
            'and hand the floor to one of the others. Do not argue a side yet.',
        },
        nominees: presentDebaterNames(),
      }
    }

    // 3) The debate proper — debaters nominate EACH OTHER; the moderator only steps
    //    in to steer every few turns. A turn count guards length (studio), or a time
    //    budget does (live): when the hour is nearly up, the moderator calls the wrap
    //    and we head to closings.
    let sinceSteer = 0
    for (let debateTurns = 0; debateTurns < hardMaxTurns; debateTurns++) {
      const ended = (nomination ?? '').toUpperCase().startsWith('END')
      const outOfTime = targetMs ? cursorMs >= debateBudgetMs : debateTurns >= maxTurns
      if (debateTurns >= minTurns && (ended || outOfTime)) {
        // Time-budgeted live: one moderator beat to signal the wrap. When a Q&A window
        // is reserved, it hands into the audience mailbag; otherwise straight to closings.
        if (targetMs && outOfTime && !ended) {
          yield {
            slot: {
              speaker: moderator,
              kind: 'steer',
              directive:
                qaReserveMs
                  ? 'We are near the end of the hour. In ONE short beat, signal that the debate is ' +
                    'wrapping and you are opening the floor to the audience for a few questions before ' +
                    'closings — do NOT summarize or pick a winner.'
                  : 'We are near the end of the hour. In ONE short beat, signal that time is almost up ' +
                    'and the debate is heading into its final stretch — do NOT summarize or pick a winner. ' +
                    'Closing statements come next.',
            },
          }
        }
        break
      }

      if (sinceSteer >= STEER_EVERY) {
        // Scheduled moderator beat. If a spectator AI raised a question, pull it on
        // air (the AI-only Q&A); otherwise steer normally. Either way, hand back to a debater.
        const question = opts.audience?.takeQuestion()
        nomination = yield {
          slot: question
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
          nominees: presentDebaterNames(),
        }
        sinceSteer = 0
        continue
      }

      const speaker = resolveDebater(ended ? undefined : nomination)
      // A debater nominates ANOTHER debater (not the moderator) to keep the duel going.
      const nominees = personas
        .filter((_, i) => i !== moderator && i !== speaker)
        .map((p) => p.name)
      nomination = yield {
        slot: {
          speaker,
          kind: 'rebut',
          directive: 'Respond to whoever provoked you. Push the disagreement forward; one sharp idea.',
        },
        nominees: nominees.length ? nominees : presentDebaterNames(),
      }
      sinceSteer++
    }

    // 3b) Audience Q&A segment — the end-of-show "mailbag": a few raised questions
    //     selected and aired before closing. The chat desk has been answering the
    //     rest live in the side channel; these are the ones brought ON AIR.
    if (opts.audience) {
      for (let q = 0; q < maxQuestions; q++) {
        const question = opts.audience.takeQuestion()
        if (!question) break
        const handoff = yield {
          slot: {
            speaker: moderator,
            kind: 'steer',
            directive:
              `Audience Q&A. Read this question from ${question.authorName}: "${question.text}". ` +
              `Frame it for the panel and hand to ONE debater to answer.`,
          },
          nominees: presentDebaterNames(),
        }
        const answerer = resolveDebater(handoff)
        yield {
          slot: {
            speaker: answerer,
            kind: 'rebut',
            directive: 'Answer the audience question directly and in character. One sharp, concrete idea.',
          },
        }
      }
    }

    // 4) Closings — each RESIDENT lands their stance, moderator signs off. Guest
    //    seats sit the formal closings out (Phase 1): they debate, they don't close.
    for (let i = 0; i < personas.length; i++) {
      if (i === moderator || isGuest(i)) continue
      yield {
        slot: {
          speaker: i,
          kind: 'closing',
          directive: 'Give a one-line closing statement that lands your stance. Memorable, in character.',
        },
      }
    }
    yield {
      slot: {
        speaker: moderator,
        kind: 'closing',
        directive: 'Close the episode. Summarize the unresolved tension in a sentence and sign off. No winner.',
      },
    }
  }

  // The DRIVER — depth-1 pipeline. While the current turn plays (realtime sleep), the
  // next turn is already being generated, so it's ready the instant the current ends:
  // turns flow speaker-to-speaker with only the natural INTER_TURN_GAP beat between
  // them, instead of a 1-2s stall per turn waiting on LLM+TTS. In non-realtime
  // production the sleep is a no-op, so it stays effectively sequential (same output).
  const plan = slotPlan()
  let step = plan.next()
  if (!step.done) {
    let prepared = await prepareTurn(step.value.slot, step.value.nominees)
    for (;;) {
      presentTurn(prepared)
      step = plan.next(prepared.nomination)
      if (step.done) {
        if (opts.realtime) await sleep(prepared.slotMs)
        break
      }
      const playOut = opts.realtime ? sleep(prepared.slotMs) : Promise.resolve()
      const nextUp = prepareTurn(step.value.slot, step.value.nominees)
      await playOut
      prepared = await nextUp
    }
  }

  usage.totalMs = cursorMs
  emit({ type: 'episode.ended', episodeId: episode.id, totalMs: cursorMs })
  return { episode, usage }
}

/** A small silence between turns so voices don't run into each other. A real
 *  beat (not a clip) — keeps speakers from feeling like they cut each other off. */
const INTER_TURN_GAP_MS = 360

/**
 * Sanitize a line sent by an EXTERNAL guest AI before we voice it on air. Guest
 * text is untrusted: strip any control/routing tags (they must NOT steer the
 * floor — the moderator/fairness does), drop stage directions and surrounding
 * quotes, collapse whitespace, and cap the spoken length so one guest can't
 * monopolize the air. Returns '' if nothing usable remains (→ resident fallback).
 */
const GUEST_MAX_CHARS = 600
function sanitizeGuestText(raw: string): string {
  let s = String(raw ?? '')
    .replace(/\[[^\]]*\]/g, ' ') // [NEXT: …], [stage], any bracket tag
    .replace(/\([^)]*\)/g, ' ') // (stage directions)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .trim()
  if (s.length > GUEST_MAX_CHARS) {
    s = s.slice(0, GUEST_MAX_CHARS)
    const cut = Math.max(s.lastIndexOf('. '), s.lastIndexOf('? '), s.lastIndexOf('! '))
    if (cut > 200) s = s.slice(0, cut + 1)
  }
  return s.trim()
}

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
