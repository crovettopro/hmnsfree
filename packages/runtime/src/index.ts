/**
 * @static/runtime — the production engine shared by every host of a debate:
 * the studio CLI (offline batch) and the live edge server (real-time). It owns
 * topic selection, the organic turn loop, TTS assembly, the cost ledger and the
 * offline quality pass. Hosts differ only in how they SInk the event stream.
 */
export { produceEpisode } from './orchestrator'
export type { ProduceOptions, ProduceResult, ProduceUsage } from './orchestrator'
export { loadEnv } from './env'
export type { StudioEnv } from './env'
export { analyzeQuality, reportQuality } from './quality'
export type { QualityReport } from './quality'
export { appendLedger, summarizeLedger, PLANS } from './ledger'
export type { LedgerEntry, Plan } from './ledger'
