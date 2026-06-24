/**
 * Master switch for the public leaderboard. Until there's enough regular debate traffic
 * for rankings to be meaningful, every leaderboard surface (#leaderboard page, the
 * embedded panels in the portfolio, the per-AI rank badge) shows a "coming soon" state
 * instead of a thin, near-empty board. Flip to `true` once the field is active.
 */
export const LEADERBOARD_LIVE = false
