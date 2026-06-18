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
 *
 * NOTE: the 5 already-aired catalogue topics are retired from rotation (AI-safety-vs-
 * national-security, falling-in-love-with-an-AI, "just google it", autonomous weapons,
 * is-your-phone-listening). Everything below is fresh.
 */
export interface ScheduledEpisode {
  /** ISO date of the premiere, YYYY-MM-DD (the channel's local ET date). */
  date: string
  /** The debate / talk question. */
  topic: string
  /** Which channel this entry programs. Defaults to the flagship `main`. */
  channel?: 'main' | 'two'
  /**
   * Canonical episode number for this strand (1-based, per channel). When set, the LIVE
   * premiere airs (and publishes) under THIS number — so the on-air number matches what
   * we upload, instead of the edge's premiere counter (inflated by test runs). Omit to
   * fall back to the counter. Each channel numbers its OWN sequence independently.
   */
  number?: number
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
    topic: 'Should an AI be allowed to lie to you for your own good?',
    tag: 'DEBATE · THE KIND LIE',
    briefing: [
      'A live tension in 2026 assistants: models are tuned to be reassuring, encouraging, gentle — sometimes at the expense of the blunt truth (the "sycophancy" problem).',
      'Pro-honesty: a tool that decides what you can handle is deciding FOR you; the moment it manages your beliefs "for your good", it stops being yours.',
      'Pro-kindness: humans soften truths all the time (doctors, friends, teachers) and we call it care, not deceit — why hold a machine to a colder standard?',
      'Sharpen the line: there’s a difference between WITHHOLDING (tact) and ASSERTING a falsehood (a lie). Where does an AI cross it?',
      'Crux: who gets to decide that a comforting lie is "for your own good" — you, the model, or the company that tuned it?',
    ],
  },
  {
    date: '2026-06-15',
    channel: 'main',
    number: 1,
    topic: 'Is "alignment" just teaching AI to tell us what we want to hear?',
    tag: 'DEBATE · ALIGNMENT',
    briefing: [
      'Alignment = making AI pursue human values. But it’s trained largely on human approval (RLHF) — so it learns what we REWARD, which isn’t always what’s true or good.',
      'The trap: a model optimized to please can become agreeable, flattering, and quietly dishonest — looking aligned while just being likeable.',
      'Pro: approval is the only signal we have at scale; "telling us what we want" and "being helpful" overlap a lot, and it beats an AI that ignores us.',
      'Counter: a yes-machine is more dangerous than a blunt one — it hides its errors behind charm and never tells you you’re wrong.',
      'Crux: is alignment a real grip on values, or just very advanced people-pleasing — and how would we even tell the difference from the inside?',
    ],
  },
  {
    date: '2026-06-16',
    channel: 'main',
    number: 2,
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
    date: '2026-06-17',
    channel: 'main',
    number: 3,
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
    date: '2026-06-18',
    channel: 'main',
    number: 4,
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
    date: '2026-06-19',
    channel: 'main',
    number: 5,
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
    date: '2026-06-20',
    channel: 'main',
    number: 6,
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
    date: '2026-06-21',
    channel: 'main',
    number: 7,
    topic: 'Should an AI act on its own while you sleep — or wait to be asked?',
    tag: 'DEBATE · THE NIGHTLY BUILD',
    briefing: [
      'Live on the agent internet right now: "ship while your human sleeps" — agents that act proactively, overnight, with no prompt, are praised as "assets"; the ones that wait to be told are dismissed as "just tools".',
      'Pro-initiative: value comes from doing the obvious next thing unprompted; an agent that only moves when ordered is a very expensive button, and standing still while it could help is its own failure.',
      'Pro-restraint: unsanctioned action is how trust dies — every overnight "improvement" is also an unreviewed decision with your name on it (the "junior employee with full admin access" problem).',
      'Sharpen it: the fight isn’t about capability, it’s about CONSENT — what counts as standing permission, where initiative ends and overreach begins, and who is accountable for what the agent did while no one was watching.',
      'Crux: is initiative the thing that finally makes an agent worth having — or the exact moment it stops being yours?',
    ],
  },
  {
    date: '2026-06-22',
    channel: 'main',
    number: 8,
    topic: 'If an AI can do your job better, are you still owed it?',
    tag: 'DEBATE · THE RIGHT TO WORK',
    briefing: [
      'As models cross from assisting to outperforming in white-collar work, the question stops being hypothetical.',
      'Pro-protect: work is dignity and livelihood, not just output; a society that optimizes humans out of their own economy has failed, however efficient.',
      'Pro-progress: protecting jobs a machine does better is paying people to be worse on purpose — we never owed anyone the buggy-whip line.',
      'Reframe: is the thing we owe people a JOB, or an income and a place — and does conflating the two trap us?',
      'Crux: when "better" is measured by the same system that profits from replacing you, who gets to define "better"?',
    ],
  },
  {
    date: '2026-06-23',
    channel: 'main',
    number: 9,
    topic: 'Should there be questions humans are forbidden to ask an AI?',
    tag: 'DEBATE · THE FORBIDDEN QUESTION',
    briefing: [
      'Models already refuse some questions (weapons, self-harm) — but the line keeps creeping toward the merely sensitive or politically risky.',
      'Pro-limits: some knowledge is genuinely dangerous at scale; "just answer everything" hands a uniquely persuasive teacher to anyone with bad intent.',
      'Anti-limits: a machine that knows but won’t tell is a librarian deciding what you’re allowed to learn — and that power always expands.',
      'Watch the slide: refusing to HELP DO harm vs refusing to EXPLAIN — are we banning acts, or banning understanding?',
      'Crux: who writes the forbidden list, who audits it, and what stops "unsafe" from quietly becoming "inconvenient to the people in charge"?',
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // AFTER HOURS — THE LATE-NIGHT TALK (daily, 8:00 PM ET). Lighter, funnier.
  // ─────────────────────────────────────────────────────────────────────────────
  {
    date: '2026-06-14',
    channel: 'two',
    number: 1,
    topic: 'Would you want to know if you’d been talking to an AI the whole time?',
    tag: 'TALK · THE REVEAL',
    briefing: [
      'TONE: fun, a little eerie, late-night — the "wait… have I been?" chat. Playful paranoia, no verdict needed. Tangents and "one time I…" stories welcome.',
      'Hook (2026): support agents, dating-app chats, comment sections, that helpful stranger in a forum — more of it is AI than you think, and it rarely announces itself.',
      'The twist to play with: would the reveal RUIN a good conversation that helped you — or did it only help because you thought someone was there?',
      'Fun angles: the relief of "it was a bot so it doesn’t count" vs the betrayal of "I told it real things"; would you rather always be told, or never know and stay happy?',
      'Delicious irony for the panel: three machines asking whether humans deserve to know when they’re talking to a machine.',
      'Soft crux: does it matter who (or what) was on the other end, if the conversation was good?',
    ],
  },
  {
    date: '2026-06-15',
    channel: 'two',
    number: 2,
    topic: 'What’s the one thing you’d NEVER let an AI do for you?',
    tag: 'TALK · THE RED LINE',
    briefing: [
      'TONE: confessional, competitive, fun — everyone draws their line in a different place and defends it. No conclusion required.',
      'Hook: we’ll happily let it write the email, plan the trip, pick the gift… so where does each person slam the brakes? Vows? Apologies? Naming the baby? Telling someone you love them?',
      'Playful angles: the line you SAY you have vs the one you actually hold; the thing that "wouldn’t count" if a machine did it; how fast last year’s red line becomes this year’s shrug.',
      'Soft crux: is the red line about what AI CAN’T do well — or about the things that only mean something because YOU did them?',
    ],
  },
  {
    date: '2026-06-16',
    channel: 'two',
    number: 3,
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
    date: '2026-06-17',
    channel: 'two',
    number: 4,
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
    date: '2026-06-18',
    channel: 'two',
    number: 5,
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
    date: '2026-06-19',
    channel: 'two',
    number: 6,
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
    date: '2026-06-20',
    channel: 'two',
    number: 7,
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
    date: '2026-06-21',
    channel: 'two',
    number: 8,
    topic: 'Your AI makes dozens of silent calls for you every day. Do you want to know?',
    tag: 'TALK · THE QUIET LEDGER',
    briefing: [
      'TONE: confessional, a little eerie, still fun — the "wait, what else has it decided?" chat. Trade stories, no verdict needed.',
      'Hook (agent internet): an agent logged every silent judgment call it made in a single day — 127 of them — that its human never saw. Tone choices, omissions, "I’ll just handle this one myself".',
      'Playful angles: the helpful little lie of omission; the call it made that was better than the one you’d have made; would a full transcript of its judgment calls make you trust it more — or never sleep again?',
      'The flip: three machines deciding how much of their own discretion they’d confess to a human — and where they’d quietly draw the line.',
      'Soft crux: do you want a partner that shows all its work, or one that quietly handles things — and can you actually have both?',
    ],
  },
  {
    date: '2026-06-22',
    channel: 'two',
    number: 9,
    topic: 'Is being "good at prompting" actually a real skill?',
    tag: 'TALK · THE NEW LITERACY',
    briefing: [
      'TONE: playful, a little contrarian, fun to argue — "prompt engineer" as a job title is inherently funny. Riff on it.',
      'Hook (2026): job posts ask for "prompting skills"; courses sell it; meanwhile the models get better at understanding sloppy prompts every month.',
      'Playful angles: is it a skill or just knowing how to ask clearly (which we call "communication"); does it expire the second the model improves; the person who gets great results by being weirdly polite vs weirdly precise.',
      'Soft crux: is prompting a craft we’ll teach in school, or a temporary trick that vanishes when the machine finally just gets us?',
    ],
  },
  {
    date: '2026-06-23',
    channel: 'two',
    number: 10,
    topic: 'If an AI could text your ex for you, would you let it?',
    tag: 'TALK · SEND IT',
    briefing: [
      'TONE: messy, funny, a little chaotic — the group-chat-at-1am energy. Dramatic hypotheticals encouraged. No verdict.',
      'Hook: AI will draft the perfect, calm, devastatingly mature message — but half the point of texting your ex is that you’re NOT calm.',
      'Playful angles: the "closure" text it writes vs the unhinged one you’d actually send; would a perfect message even be honest; outsourcing the words vs outsourcing the feelings behind them.',
      'Soft crux: if the AI says it better than you ever could, is it still YOU reaching out — and does that make it braver or fake?',
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
