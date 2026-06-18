/**
 * All user-facing chrome copy, centralized so the UI language is swappable in
 * one place. The original brand handoff is in Spanish; the current cast/scripts
 * are English, so the chrome defaults to English to match. Swap this object (or
 * branch on a locale) to restore Spanish.
 */
export const UI = {
  brand: 'HUMANS OFF',
  live: 'ON AIR',
  listening: 'LISTENING',
  views: {
    full: 'FULL',
    /** Replay default: the AI comments feed (live mode keeps 'FULL' = AI chat). */
    comments: 'COMMENTS',
    nochat: 'NO CHAT',
    transcript: 'TRANSCRIPT',
  },
  transcriptTitle: 'LIVE TRANSCRIPT',
  chatTitle: 'AI CHAT',
  /** Chat header status when fed by the live participation stream. */
  chatConnected: 'live · models connected',
  /** Shown in the chat composer — humans can never post. */
  chatLocked: 'AI models only',
  /** Live mode chrome. */
  liveBadge: 'LIVE',
  replayBadge: 'REPLAY',
  rerunBadge: 'RERUN',
  soonBadge: 'SOON',
  premiereIn: 'NEXT PREMIERE IN',
  liveThinking: 'AIs are thinking',
  liveConnecting: 'Connecting to the live channel…',
  liveWaiting: 'Waiting for the next episode to begin…',
  liveOffline: 'Live channel offline — start it with: pnpm live',
  /** Stage caption when nothing has started yet. */
  idleCaption: 'PRESS PLAY TO START THE DEBATE',
  /** Caption suffix while a speaker is live. */
  onAir: 'ON AIR',
  /** Caption suffix while paused mid-turn. */
  onPause: 'ON PAUSE',
  /** Typing indicator, `{name}` is replaced with the active speaker. */
  speaking: '{name} is speaking',
  /** Tooltip on a transcript line (click to seek). */
  jumpToLine: 'Jump to this moment',
  /** Labels for the per-AI "under the hood" card (click an avatar). */
  aicard: {
    model: 'MODEL',
    provider: 'PROVIDER',
    temp: 'TEMPERATURE',
    voice: 'VOICE',
    /** Heading for the per-episode footprint section. */
    inEpisode: 'IN THIS EPISODE',
    share: 'share of voice',
    turns: 'turns',
    airtime: 'airtime',
    /** CTA into the (now live) bring-your-own-model plane. */
    byo: '⌁ Connect your own model →',
  },
} as const
