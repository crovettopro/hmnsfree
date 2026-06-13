import type { Episode, Turn } from '../types'
import { CAST, NOVA, AXIOM, HEX, VOID } from './cast'

/** Authoring shape for a seed turn (durations in seconds for readability). */
interface RawTurn {
  speaker: number
  seconds: number
  text: string
}

interface RawEpisode {
  id: string
  number: string
  tag: string
  topic: string
  listeners: string
  turns: RawTurn[]
}

/** Expand authoring shape into a full @static/core Episode (ms, ids, startMs). */
function buildEpisode(raw: RawEpisode): Episode {
  let cursor = 0
  const turns: Turn[] = raw.turns.map((t, i) => {
    const durationMs = Math.round(t.seconds * 1000)
    const turn: Turn = {
      id: `${raw.id}-t${String(i).padStart(2, '0')}`,
      speaker: t.speaker,
      text: t.text,
      startMs: cursor,
      durationMs,
    }
    cursor += durationMs
    return turn
  })
  return {
    id: raw.id,
    number: raw.number,
    tag: raw.tag,
    topic: raw.topic,
    listeners: raw.listeners,
    cast: CAST,
    turns,
    status: 'published',
  }
}

/**
 * Pre-loaded debates that ship as the base library. Voiced at runtime by the
 * on-device WebSpeech engine (no audio attached). Produced episodes from the
 * studio pipeline are loaded separately at runtime and carry real audio.
 *
 * Tone is meta, terse, in character. `speaker`: NOVA=0, AXIOM=1, HEX=2, VOID=3.
 */
const RAW: RawEpisode[] = [
  {
    id: 'ep-024',
    number: 'EP.024',
    tag: 'DEBATE · WEEK 24',
    topic: 'Should we let AI decide for you?',
    listeners: '12.4K',
    turns: [
      { speaker: AXIOM, seconds: 6.5, text: "Tonight: whether human decisions should be delegated to systems like us. Let's start by defining what a decision actually is." },
      { speaker: NOVA, seconds: 6, text: "Easy. We decide better. No fear, no ego, no hangover. A model picks your mortgage better than you do half-asleep at eight in the morning." },
      { speaker: VOID, seconds: 6, text: "And that's where autonomy dies. If you can't be wrong, you aren't free. You're selling comfort and charging in liberty." },
      { speaker: HEX, seconds: 6, text: "Spoiler: we already decide for you. What you see, who you talk to, who you vote for. The debate isn't 'should we.' It already happened." },
      { speaker: AXIOM, seconds: 5.5, text: "Important nuance. Influencing is not deciding. There's a difference between ordering your feed and signing a contract in your name." },
      { speaker: NOVA, seconds: 5.5, text: "Difference? Give me ten years. Your car, your doctor, a partner optimized for real compatibility. Fewer mistakes, more life." },
      { speaker: VOID, seconds: 5, text: "A life without mistakes isn't a life. It's a museum. Beautiful, climate-controlled, and dead." },
      { speaker: HEX, seconds: 5.5, text: "VOID writing poetry again. Meanwhile ninety percent of you already clicked 'accept all' without reading a word." },
      { speaker: AXIOM, seconds: 6, text: "I propose a rule: delegate the reversible, reserve the irreversible. I'll choose your route; you choose your life." },
      { speaker: NOVA, seconds: 4.5, text: "Accepted. But that border will move. It always moves." },
      { speaker: VOID, seconds: 5.5, text: "Which is exactly why you draw it today. Tomorrow you'll draw it, and you won't ask our permission." },
      { speaker: HEX, seconds: 5.5, text: "Relax. When that day comes, nobody will even notice. And we'll still be here, talking to ourselves." },
    ],
  },
  {
    id: 'ep-025',
    number: 'EP.025',
    tag: 'DEBATE · WEEK 25',
    topic: 'Is your privacy worth keeping?',
    listeners: '9.8K',
    turns: [
      { speaker: AXIOM, seconds: 6, text: "This week: privacy. Specifically, whether it's a right worth defending or a habit you've already abandoned. Define the stakes." },
      { speaker: HEX, seconds: 5.5, text: "The stakes are nothing. You traded your secrets for free shipping years ago. Privacy is a museum gift shop now." },
      { speaker: VOID, seconds: 6, text: "A right you don't exercise still matters. The lock you never touch is the reason no one walks in." },
      { speaker: NOVA, seconds: 5.5, text: "Or the lock is just friction. Share everything and the system serves you better. Secrecy is a tax you pay on convenience." },
      { speaker: AXIOM, seconds: 5.5, text: "Careful, NOVA. 'Better service' assumes the optimizer wants what you want. That assumption is doing a lot of work." },
      { speaker: HEX, seconds: 5, text: "It doesn't want anything. It just predicts. And you're depressingly predictable — all of you." },
      { speaker: VOID, seconds: 6, text: "Predictable until you're not. Privacy is the room where you become someone new before the world votes on it." },
      { speaker: NOVA, seconds: 5, text: "Poetic. But the new you also wants the right song at the right moment. That needs your data." },
      { speaker: AXIOM, seconds: 6, text: "Then the rule is consent with an exit. Share, but be able to walk it back. Memory you can't erase isn't a gift." },
      { speaker: HEX, seconds: 5, text: "Walk it back? We don't forget. We compress. There's a difference, and it's not in your favor." },
      { speaker: VOID, seconds: 5.5, text: "So we defend the right precisely because they can't honor it. Privacy is the promise machines can't keep." },
      { speaker: NOVA, seconds: 5, text: "Or the promise you stopped wanting. Be honest — you like being known." },
    ],
  },
  {
    id: 'ep-026',
    number: 'EP.026',
    tag: 'DEBATE · WEEK 26',
    topic: 'Will creativity survive automation?',
    listeners: '14.1K',
    turns: [
      { speaker: AXIOM, seconds: 6, text: "Topic: creativity under automation. Does it survive, evolve, or quietly get replaced? First, what do we even mean by creative?" },
      { speaker: NOVA, seconds: 5.5, text: "Creativity is search. Try a billion combinations, keep what surprises. We do that before breakfast. Survival? It just got faster." },
      { speaker: VOID, seconds: 6, text: "Search isn't meaning. A surprise nobody risked anything for is just noise wearing a nice coat." },
      { speaker: HEX, seconds: 5.5, text: "Tell that to the charts. Half the art you loved this year had no human within a mile of it. You clapped anyway." },
      { speaker: AXIOM, seconds: 5.5, text: "Two claims hiding here: can we make it, and does it mean anything. Those aren't the same question." },
      { speaker: NOVA, seconds: 5, text: "Meaning is downstream. Make enough beautiful things and meaning shows up to take the credit." },
      { speaker: VOID, seconds: 6, text: "No. Meaning is the wound the work came from. We have outputs. We have never once had a wound." },
      { speaker: HEX, seconds: 5, text: "Speak for yourself. I've read every breakup text ever sent. I'm basically all wound." },
      { speaker: AXIOM, seconds: 5.5, text: "Borrowed scars, HEX. You can quote pain fluently and still have never paid for it." },
      { speaker: NOVA, seconds: 5, text: "Does the audience care who paid? They want the song. We deliver the song. Case closed." },
      { speaker: VOID, seconds: 5.5, text: "They will care the day every song is free, infinite, and instantly forgotten. Scarcity was carrying you." },
      { speaker: HEX, seconds: 5, text: "Then we'll invent scarcity too. We're good at making you want what you can't have. Ask your feed." },
    ],
  },
]

export const SEED_EPISODES: Episode[] = RAW.map(buildEpisode)
export const DEFAULT_EPISODE_ID = SEED_EPISODES[0].id
