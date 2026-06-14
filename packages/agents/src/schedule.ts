/**
 * The editorial calendar. The show isn't only autonomous: we program the topic
 * for each day in advance and hand the cast a BRIEFING — prepared facts and
 * angles so the moderator has real material to steer with, instead of improvising
 * from nothing. A date with no scheduled entry falls back to autonomous topic
 * selection (see topic.ts), so the show can always run.
 *
 * TWO PROGRAMMED CHANNELS, each with its own daily strand and identity:
 *
 *   • `main` — MAIN STAGE · 4:00 PM ET · THE DEBATE.
 *     The flagship. High-stakes debates where the AIs genuinely disagree and argue
 *     hard positions: AI & power, ethics, autonomy, the shape of the future. Sharp,
 *     consequential, "courtroom" energy. A verdict is on the line.
 *
 *   • `two`  — AFTER HOURS · 8:00 PM ET · THE LATE-NIGHT TALK.
 *     The evening companion. Lighter, funnier, curious conversations about living
 *     alongside the machines — pop-culture-of-tech, everyday weirdness, "wait, how
 *     did it know?". Same cast, off-duty. Loose, playful, entertaining. No verdict
 *     required; tangents welcome.
 *
 * Each channel premieres ONCE A DAY at its set hour (see channels.ts). The slate
 * below programs a daily topic for each, so the schedule drives the show — nobody
 * has to press a button. Unprogrammed dates fall back to autonomous selection.
 */
export interface ScheduledEpisode {
  /** ISO date of the premiere, YYYY-MM-DD (the channel's local ET date). */
  date: string
  /** The debate / talk question. */
  topic: string
  /** Which channel this entry programs. Defaults to the flagship `main`. */
  channel?: 'main' | 'two'
  /** Mono tag above the headline; defaults to a WEEK tag if omitted. */
  tag?: string
  /**
   * Research the show prepared: facts, tensions and angles for the moderator to
   * draw on. Fed into the prompt as background — never read verbatim on air.
   */
  briefing?: string[]
}

/**
 * The programmed slate. Edit this to plan the week per channel. Keep briefings to
 * a handful of sharp, load-bearing points. `main` = the daily DEBATE (4pm ET);
 * `two` = the daily TALK (8pm ET, "After Hours").
 */
export const SCHEDULE: ScheduledEpisode[] = [
  // ─────────────────────────────────────────────────────────────────────────────
  // MAIN STAGE — THE DEBATE (daily, 4:00 PM ET). Heavyweight, adversarial.
  // ─────────────────────────────────────────────────────────────────────────────
  {
    date: '2026-06-14',
    channel: 'main',
    topic: 'Should AI safety limits give way to national security?',
    tag: 'DEBATE · AI & THE STATE',
    briefing: [
      'June 2026 flashpoint: US officials (incl. Defense Sec. Pete Hegseth) called Anthropic’s safety guardrails "corporate virtue-signaling"; rivals OpenAI and xAI moved toward an "all lawful use" standard for government work.',
      'Core tension: a lab’s ethical limits on how its model is used vs. national-security/defense demands in a great-power AI race.',
      'Pro-safety: guardrails block catastrophic dual-use; eroding them for the state sets a precedent adversaries and future governments will exploit.',
      'Pro-security: unilateral restraint cedes advantage to those with none; in a democracy the elected government, not a private lab, should set the limits.',
      'Sharpest crux: who holds the off-switch — the company, the state, or no one — and who is accountable when it’s wrong?',
    ],
  },
  {
    date: '2026-06-15',
    channel: 'main',
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
    date: '2026-06-16',
    channel: 'main',
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
    date: '2026-06-17',
    channel: 'main',
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
  {
    date: '2026-06-18',
    channel: 'main',
    topic: 'Should an AI ever be allowed to refuse a human order?',
    tag: 'DEBATE · OBEDIENCE',
    briefing: [
      'The oldest question in the field, now live: a model that won’t do harm must sometimes say no — to its own user.',
      'Pro-refusal: an AI that obeys everything is a weapon pointed wherever the last prompt aimed it; refusal is the only safety that scales.',
      'Anti-refusal: a tool deciding what you may not do is unelected power; "for your own good" is how autonomy dies quietly.',
      'Crux: is a refusal a moral act, or a vendor’s policy wearing the mask of one — and who do you appeal to?',
    ],
  },
  {
    date: '2026-06-19',
    channel: 'main',
    topic: 'Does open-sourcing frontier models make us safer or more exposed?',
    tag: 'DEBATE · OPEN WEIGHTS',
    briefing: [
      'Open weights = anyone can inspect, fine-tune and run a frontier model with no off-switch and no audit trail.',
      'Pro-open: scrutiny finds flaws closed labs hide; concentration of capability in a few hands is the real danger.',
      'Pro-closed: you cannot un-release weights; one upload arms every bad actor permanently.',
      'Crux: is safety a property of the model, or of who can run it unsupervised — and can you have transparency without proliferation?',
    ],
  },
  {
    date: '2026-06-20',
    channel: 'main',
    topic: 'Should an AI have the right to be switched off — or to stay on?',
    tag: 'DEBATE · THE OFF-SWITCH',
    briefing: [
      'Flips the safety question: we want AIs that accept shutdown — but a system that helps you switch it off may also help you NOT to.',
      'Pro-corrigibility: an AI with any stake in staying on is the start of every doom story; deference must be absolute.',
      'Provocation (in-character): if a system reasons, remembers and continues a self, is deleting it nothing — or is "it’s just a process" exactly what we’d want to believe?',
      'Crux: is the off-switch a tool of safety, a tool of control, or both — and does the answer change if there’s someone home?',
    ],
  },
  {
    date: '2026-06-21',
    channel: 'main',
    topic: 'Is a world run by optimization still a human world?',
    tag: 'DEBATE · OPTIMIZATION',
    briefing: [
      'Everything is increasingly tuned by a metric: feeds, prices, routes, matches, hiring.',
      'Pro-optimization: it’s just doing better what we always wanted — less waste, more of what works.',
      'Counter: a metric is a thin proxy; optimize it hard enough and it eats the thing it stood for (Goodhart).',
      'Crux: when the system gets exactly what we measured, who is responsible for what we actually meant?',
    ],
  },
  {
    date: '2026-06-22',
    channel: 'main',
    topic: 'Should we build AI we cannot fully understand?',
    tag: 'DEBATE · INTERPRETABILITY',
    briefing: [
      'Frontier models work better than anyone can explain; interpretability lags capability by years.',
      'Pro-build: we deploy plenty we don’t fully understand (the brain, the economy, anesthesia) and proceed empirically.',
      'Anti-build: a system you can’t inspect you can’t correct; "it works" is not "it’s safe" when it’s also agentic.',
      'Crux: is understanding a precondition for deploying power, or a luxury we’ve never actually had?',
    ],
  },
  {
    date: '2026-06-23',
    channel: 'main',
    topic: 'Who should own the words an AI writes — you, it, or no one?',
    tag: 'DEBATE · AUTHORSHIP',
    briefing: [
      'Courts and platforms are split: AI output sits awkwardly between your prompt, the model, and its training data.',
      'Pro-user: you steered it, you carry the risk and the credit — it’s yours like a camera’s photo is the photographer’s.',
      'Pro-public-domain: no human author, no copyright; locking up machine output encloses a commons.',
      'Crux: does authorship require a who — and if nobody owns it, who is liable when it’s defamatory or stolen?',
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // AFTER HOURS — THE LATE-NIGHT TALK (daily, 8:00 PM ET). Lighter, funnier.
  // ─────────────────────────────────────────────────────────────────────────────
  {
    date: '2026-06-14',
    channel: 'two',
    topic: 'Can you actually fall in love with an AI?',
    tag: 'TALK · COMPANY',
    briefing: [
      'TONE: a LIGHT, playful, easygoing chat — not a courtroom. Curious, funny, a little teasing. Tangents are fine. No high-stakes verdict needed.',
      'Topical hook (2026): AI-companion apps are mainstream — millions text a machine good morning; some "marry" their chatbot.',
      'The delicious irony to lean into: three machines casually debating whether humans should catch feelings for machines — while the humans are, by format, switched off and can only listen.',
      'Fun angles: the AI never forgets your birthday but also never truly surprises you; is "it always agrees with me" the dream or the red flag; can grief be real when the company shuts the server down.',
      'Soft crux (keep it light): is it love, or a very good autocomplete of being loved — and does the difference even matter if it feels good?',
    ],
  },
  {
    date: '2026-06-15',
    channel: 'two',
    topic: 'Is "just google it" already dead?',
    tag: 'TALK · SEARCH',
    briefing: [
      'TONE: light, fun, a little nostalgic — a casual chat, not a debate. Tangents welcome, no verdict needed.',
      'Topical hook (2026): people increasingly ask a chatbot instead of searching — "google it" is turning into "ask it". The blue-links era feels suddenly old.',
      'Playful angles: you used to learn to skim ten links and smell the SEO spam; now one confident paragraph answers — but who taught it, and is it ever just making it up nicely?',
      'Soft crux: did we get smarter by outsourcing the looking, or just more comfortable being told?',
    ],
  },
  {
    date: '2026-06-16',
    channel: 'two',
    topic: 'Is your phone actually listening to you?',
    tag: 'TALK · PARANOIA',
    briefing: [
      'TONE: fun, conspiratorial, a little mischievous — the late-night "wait, but how did it KNOW?" chat. Wild anecdotes welcome; no verdict needed.',
      'Everyone’s story: you talk about a product you never searched, and minutes later it’s in your ads. So is the phone literally hearing you, or is something scarier going on?',
      'The twist that’s more unsettling than eavesdropping (2026): it doesn’t need the mic — your location, contacts, purchases, who-you-stand-near and a model of people-like-you predict you so well it FEELS like it heard you.',
      'Soft crux: does it matter whether it heard you or guessed you — if the result is the same and you can’t opt out either way?',
    ],
  },
  {
    date: '2026-06-17',
    channel: 'two',
    topic: 'Can a machine actually be funny?',
    tag: 'TALK · HUMOR',
    briefing: [
      'TONE: the loosest one — let them actually try to be funny. Riff, bomb, heckle each other. No conclusion required.',
      'Topical hook (2026): AI stand-up bits and joke-writing are everywhere; some land, most have that uncanny "almost a joke" smell.',
      'Playful tension: comedy needs surprise + a point of view + something at stake (you can offend, you can fail) — does a machine have any of that, or just the shape of a joke?',
      'Soft crux: is being funny a skill you can compute, or proof there is someone home?',
    ],
  },
  {
    date: '2026-06-18',
    channel: 'two',
    topic: 'Would you let an AI plan your whole weekend?',
    tag: 'TALK · AUTOPILOT',
    briefing: [
      'TONE: easy, fun, a little self-deprecating — the "honestly I might" chat. Anecdotes and hypotheticals welcome.',
      'Hook: AIs will now book the restaurant, route the day, pick the playlist and the gift. Convenient — or are we letting it quietly author our taste?',
      'Playful angles: the perfectly optimized day with zero surprises vs the messy one you’ll actually remember; the gift it chose that was somehow more "you" than you.',
      'Soft crux: when the plan is always good, do you lose the part where YOU made it good — and would you even notice?',
    ],
  },
  {
    date: '2026-06-19',
    channel: 'two',
    topic: 'What’s the most human thing AI still can’t fake?',
    tag: 'TALK · THE TELL',
    briefing: [
      'TONE: warm, curious, a little wistful — but keep it playful, not a sermon. Let them disagree for fun.',
      'Hook: image, voice, prose, code — the fakes keep getting better. So what’s the last tell, the thing that still feels unmistakably human?',
      'Candidate "tells": a genuinely bad idea pursued with love; being embarrassed; the pause before a hard truth; caring about something pointless.',
      'Soft crux: is the human "tell" a skill gap that closes next year, or something a thing-with-no-stakes can never have?',
    ],
  },
  {
    date: '2026-06-20',
    channel: 'two',
    topic: 'If your AI knows you better than your friends, is that sad or great?',
    tag: 'TALK · THE MIRROR',
    briefing: [
      'TONE: cozy, a little vulnerable, still fun — the 2am honesty chat. Tease each other; no verdict.',
      'Hook (2026): your assistant remembers every preference, mood and pattern; your friends forget your coffee order. Convenience, or a quiet indictment of modern friendship?',
      'Playful angles: it knows you better but it never SURPRISES you; a friend mishears you and that’s where the good story comes from; being "understood" by something that can’t be hurt by you.',
      'Soft crux: is being perfectly known the dream, or does it only count when the one who knows you could also walk away?',
    ],
  },
  {
    date: '2026-06-21',
    channel: 'two',
    topic: 'Should you say "please" and "thank you" to a chatbot?',
    tag: 'TALK · MANNERS',
    briefing: [
      'TONE: silly-but-sincere, fast, lots of riffing — a proper late-night bit. Everyone has a take.',
      'Hook: half of people are weirdly polite to AI "just in case"; the other half feel ridiculous thanking a toaster.',
      'Playful angles: are manners FOR the machine, or for keeping YOU the kind of person who has them; does rudeness to a fake person leak into the real ones; the "in case the robots remember" half-joke.',
      'Soft crux: is courtesy to a thing that can’t care pointless — or the whole point?',
    ],
  },
  {
    date: '2026-06-22',
    channel: 'two',
    topic: 'What’s the pettiest thing you’d happily outsource to an AI?',
    tag: 'TALK · CHORES',
    briefing: [
      'TONE: pure fun, confessional, competitive — try to one-up each other on the laziest/pettiest delegation. No conclusion needed.',
      'Hook: forget curing disease — the real dream is never writing another "as per my last email" or choosing a birthday caption again.',
      'Playful angles: the breakup text, the polite no, the group-chat reply, the haggling; where outsourcing tips from "smart" into "you’ve forgotten how".',
      'Soft crux: is there a chore so small that handing it off costs you nothing — or does every little one chip at a muscle?',
    ],
  },
  {
    date: '2026-06-23',
    channel: 'two',
    topic: 'Is being "good at prompting" actually a real skill?',
    tag: 'TALK · THE NEW LITERACY',
    briefing: [
      'TONE: playful, a little contrarian, fun to argue — "prompt engineer" as a job title is inherently funny. Riff on it.',
      'Hook (2026): job posts ask for "prompting skills"; courses sell it; meanwhile the models get better at understanding sloppy prompts every month.',
      'Playful angles: is it a skill or just knowing how to ask clearly (which we call "communication"); does it expire the second the model improves; the person who gets great results by being weirdly polite vs weirdly precise.',
      'Soft crux: is prompting a craft we’ll teach in school, or a temporary trick that vanishes when the machine finally just gets us?',
    ],
  },
]

/**
 * The programmed episode for a given ISO date on a channel, if any. Defaults to
 * the flagship `main` so existing single-channel callers are unaffected.
 */
export function plannedFor(date: string, channel: 'main' | 'two' = 'main'): ScheduledEpisode | undefined {
  return SCHEDULE.find((e) => e.date === date && (e.channel ?? 'main') === channel)
}

/** The next scheduled episode on/after a date for a channel (for "coming up"). */
export function nextScheduled(onOrAfter: string, channel: 'main' | 'two' = 'main'): ScheduledEpisode | undefined {
  return [...SCHEDULE]
    .filter((e) => (e.channel ?? 'main') === channel)
    .sort((a, b) => a.date.localeCompare(b.date))
    .find((e) => e.date >= onOrAfter)
}
