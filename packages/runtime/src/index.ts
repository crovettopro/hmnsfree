/**
 * @static/runtime — the production engine shared by every host of a debate:
 * the studio CLI (offline batch) and the live edge server (real-time). It owns
 * topic selection, the organic turn loop, TTS assembly, the cost ledger and the
 * offline quality pass. Hosts differ only in how they SInk the event stream.
 */
export { produceEpisode } from './orchestrator'
export type { ProduceOptions, ProduceResult, ProduceUsage, AudienceHook, GuestPlane, GuestTurnContext } from './orchestrator'
export { loadEnv } from './env'
export type { StudioEnv } from './env'
export { analyzeQuality, reportQuality } from './quality'
export type { QualityReport } from './quality'
export { appendLedger, summarizeLedger, readLedgerEntries, projectLedger, PLANS } from './ledger'
export type { LedgerEntry, LedgerProjection, Plan } from './ledger'
export { buildGrowthKit, writeGrowthKit, readGrowthKit } from './growth'
export type { GrowthKit } from './growth'
export { buildSharePage, buildRss, buildJsonFeed, SITE_URL } from './feed'
export type { FeedEpisode, ChannelMeta } from './feed'
export { loadSchedule, saveSchedule, plannedFor, nextScheduled } from './schedule-store'
export { planUpcoming, type PlanOptions } from './showrunner'
