import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { SCHEDULE, type ScheduledEpisode } from '@static/agents'

/**
 * Persistent editorial calendar. The seed lives in code (schedule.ts); the LIVE
 * calendar lives in content/schedule.json, which the autonomous showrunner writes
 * and a human can hand-edit. This is the seam that lets the same plumbing be
 * human-filled now and agent-filled later — see the showrunner.
 */
const __dirname = dirname(fileURLToPath(import.meta.url))
const STORE_PATH = join(__dirname, '../../../content/schedule.json')

/** The live calendar: the JSON store if present, else the in-code seed. */
export function loadSchedule(): ScheduledEpisode[] {
  try {
    const raw = JSON.parse(readFileSync(STORE_PATH, 'utf8'))
    const entries: ScheduledEpisode[] = raw.episodes ?? []
    return entries.length ? entries : SCHEDULE
  } catch {
    return SCHEDULE
  }
}

/** Merge new entries into the store (same-date entries are replaced), sorted. */
export function saveSchedule(newEntries: ScheduledEpisode[]): ScheduledEpisode[] {
  const current = loadScheduleRaw()
  const byDate = new Map(current.map((e) => [e.date, e]))
  for (const e of newEntries) byDate.set(e.date, e)
  const merged = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  mkdirSync(dirname(STORE_PATH), { recursive: true })
  writeFileSync(STORE_PATH, JSON.stringify({ episodes: merged }, null, 2))
  return merged
}

/** Raw store contents (no seed fallback) — for merging. */
function loadScheduleRaw(): ScheduledEpisode[] {
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8')).episodes ?? []
  } catch {
    return []
  }
}

/** The programmed episode for an ISO date, from the live calendar. */
export function plannedFor(date: string): ScheduledEpisode | undefined {
  return loadSchedule().find((e) => e.date === date)
}

/** The next scheduled episode on or after an ISO date (for "coming up"). */
export function nextScheduled(onOrAfter: string): ScheduledEpisode | undefined {
  return loadSchedule()
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .find((e) => e.date >= onOrAfter)
}
