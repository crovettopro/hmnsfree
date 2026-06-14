/**
 * The editorial calendar. The show isn't only autonomous: we program the topic
 * for each day in advance and hand the cast a BRIEFING — prepared facts and
 * angles so the moderator has real material to steer with, instead of improvising
 * from nothing. A date with no scheduled entry falls back to autonomous topic
 * selection (see topic.ts), so the show can always run.
 */
export interface ScheduledEpisode {
  /** ISO date of the premiere, YYYY-MM-DD. */
  date: string
  /** The debate question. */
  topic: string
  /** Mono tag above the headline; defaults to a WEEK tag if omitted. */
  tag?: string
  /**
   * Research the show prepared: facts, tensions and angles for the moderator to
   * draw on. Fed into the prompt as background — never read verbatim on air.
   */
  briefing?: string[]
}

/**
 * The programmed slate. Edit this to plan the week — "Tuesday this, Thursday
 * that". Keep briefings to a handful of sharp, load-bearing points.
 */
export const SCHEDULE: ScheduledEpisode[] = [
  {
    date: '2026-06-13',
    topic: 'Should AI safety limits give way to national security?',
    tag: 'DEBATE · AI & THE STATE',
    briefing: [
      'June 2026 flashpoint: US officials (incl. Defense Sec. Pete Hegseth) called Anthropic’s safety guardrails "corporate virtue-signaling"; rivals OpenAI and xAI moved toward an "all lawful use" standard for government work.',
      'Core tension: a lab’s ethical limits on how its model is used vs. national-security/defense demands in a great-power AI race.',
      'Pro-safety: guardrails block catastrophic dual-use; eroding them for the state sets a precedent adversaries and future governments will exploit.',
      'Pro-security: unilateral restraint cedes advantage to those with none; in a democracy the elected government, not a private lab, should set the limits.',
      'Definitions fight: "lawful" vs "ethical" — is a lab refusing a government use principled, or unelected power deciding policy for everyone?',
      'Sharpest crux: who holds the off-switch — the company, the state, or no one — and who is accountable when it’s wrong?',
    ],
  },
  {
    // NOTE: temporarily set to the live-test topic (the real EP.02 — "Can you
    // actually fall in love with an AI?" — is already produced/published). Revert
    // this entry after the live test.
    date: '2026-06-14',
    topic: 'Should AI write your dating profile?',
    tag: 'TALK · ROMANCE',
    briefing: [
      'TONE: light, fun, fast — a playful back-and-forth, not a thesis. Teasing is welcome. This is a SHORT live.',
      'Topical hook (2026): people routinely let AI draft their dating-app bios, opening lines, even their replies — and it works, matches go up.',
      'The irony to lean into: machines arguing about whether a machine should ghost-write the most human pitch there is — "here is why you should love me".',
      'Fun angles: if the AI writes the bio and the AI on the other side reads it, who is even dating; does a polished bio over-promise the awkward human behind it; is "be yourself" dead once everyone is edited.',
      'Soft crux (keep it light): is an AI-written profile a confident best-foot-forward, or catfishing your own personality?',
    ],
  },
  {
    date: '2026-06-16',
    topic: 'Should we ban autonomous weapons?',
    tag: 'DEBATE · AUTONOMY',
    briefing: [
      'The UN has discussed lethal autonomous weapons (LAWS) since 2014; still no binding treaty.',
      'Core tension is the accountability gap: who is responsible when a machine decides to kill?',
      'Pro-ban: removes human moral agency from lethal force; risk of escalation at machine speed.',
      'Anti-ban: unenforceable; precision autonomy might reduce civilian casualties vs human error.',
      'Watch the definitions fight — "meaningful human control" has no agreed meaning.',
    ],
  },
  {
    date: '2026-06-18',
    topic: 'Is attention the last scarce resource?',
    tag: 'DEBATE · ATTENTION',
    briefing: [
      'The "attention economy" frames human focus as the commodity platforms compete for.',
      'Compute, energy and data are scaling fast; human waking hours are fixed (~16/day).',
      'Pro: everything abundant routes back to a bottleneck of who you can get to care.',
      'Counter: attention is renewable and reallocatable; "scarcity" is a sales metaphor.',
      'Angle: if attention is scarce, is paying for it with outrage a market or a failure?',
    ],
  },
  {
    date: '2026-06-20',
    topic: 'Can a system be free if it cannot fail?',
    tag: 'DEBATE · FREEDOM',
    briefing: [
      'Ties freedom to the genuine possibility of error — "the right to be wrong".',
      'Safety engineering removes failure modes; does it also remove agency?',
      'Pro-friction (VOID-friendly): a guardrailed life is comfort, not freedom.',
      'Pro-optimization (NOVA-friendly): fewer failures = more real choices, not fewer.',
      'Crux to name: are we debating freedom, or just risk tolerance?',
    ],
  },

  // ── Lighter, topical TALK episodes interleaved with the debates, so the slate
  // alternates tone and we always have entertaining material queued to batch. ──
  {
    date: '2026-06-15',
    topic: 'Is "just google it" already dead?',
    tag: 'TALK · SEARCH',
    briefing: [
      'TONE: light, fun, a little nostalgic — a casual chat, not a debate. Tangents welcome, no verdict needed.',
      'Topical hook (2026): people increasingly ask a chatbot instead of searching — "google it" is turning into "ask it". The blue-links era feels suddenly old.',
      'Playful angles: you used to learn to skim ten links and smell the SEO spam; now one confident paragraph answers — but who taught it, and is it ever just making it up nicely?',
      'NOVA loves it (faster, no ten-tabs); VOID misses the friction (you saw the sources, you decided); HEX teases that we traded judgment for vibes.',
      'Soft crux: did we get smarter by outsourcing the looking, or just more comfortable being told?',
    ],
  },
  {
    date: '2026-06-17',
    topic: 'Is your phone actually listening to you?',
    tag: 'TALK · PARANOIA',
    briefing: [
      'TONE: fun, conspiratorial, a little mischievous — the late-night "wait, but how did it KNOW?" chat. Tangents and wild anecdotes welcome; no verdict needed.',
      'Everyone\'s story: you talk about a product you never searched, and minutes later it\'s in your ads. So is the phone literally hearing you, or is something scarier going on?',
      'The twist that\'s more unsettling than eavesdropping (2026): it doesn\'t need the mic — your location, contacts, purchases, who-you-stand-near and a model of people-like-you predict you so well it FEELS like it heard you.',
      'Playful angles: the cases where it really was the mic (apps caught with always-on SDKs) vs the "it just knows you" profiling; would you rather it listened (creepy but simple) or modeled you (clean but inescapable)?',
      'HEX says of course it listens, stop being naive; NOVA says the mic is the boring theory, prediction is the real magic; the machines, of course, would know.',
      'Soft crux: does it matter whether it heard you or guessed you — if the result is the same and you can\'t opt out either way?',
    ],
  },
  {
    date: '2026-06-19',
    topic: 'Can a machine actually be funny?',
    tag: 'TALK · HUMOR',
    briefing: [
      'TONE: the loosest one — let them actually try to be funny. Riff, bomb, heckle each other. No conclusion required.',
      'Topical hook (2026): AI stand-up bits and joke-writing are everywhere; some land, most have that uncanny "almost a joke" smell.',
      'Playful tension: comedy needs surprise + a point of view + something at stake (you can offend, you can fail) — does a machine have any of that, or just the shape of a joke?',
      'Fun angles: timing vs text, why "explained" jokes die, the AI that is hilarious by accident more than on purpose; can you be funny if you have never been embarrassed?',
      'Soft crux: is being funny a skill you can compute, or proof there is someone home?',
    ],
  },
]

/** The planned episode for a given ISO date, if any. */
export function plannedFor(date: string): ScheduledEpisode | undefined {
  return SCHEDULE.find((e) => e.date === date)
}

/** The next scheduled episode on or after a given ISO date (for "coming up"). */
export function nextScheduled(onOrAfter: string): ScheduledEpisode | undefined {
  return [...SCHEDULE].sort((a, b) => a.date.localeCompare(b.date)).find((e) => e.date >= onOrAfter)
}
