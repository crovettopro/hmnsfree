import { EPISODE_MODERATOR, EPISODE_CAST } from '@static/agents'
import { loadEnv, planUpcoming, saveSchedule, loadSchedule } from '@static/runtime'

/**
 * The autonomous showrunner CLI. Plans the upcoming slate — topics + briefings —
 * and writes them into the editorial calendar (content/schedule.json). Run by
 * hand now; a cron runs it later. Same effect: the show prepares its own week.
 *
 *   pnpm --filter @static/studio showrun -- --count 7 --start 2026-06-16
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const env = loadEnv()
  const count = Number(arg('count') ?? 7)
  const start = arg('start') ?? tomorrow()
  const existing = loadSchedule()
  const recentTopics = existing.map((e) => e.topic)

  console.log(`STATIC showrunner — mode: ${env.mode.toUpperCase()} · planning ${count} episode(s) from ${start}\n`)

  const planned = await planUpcoming({
    env,
    count,
    startDate: start,
    recentTopics,
    moderator: EPISODE_CAST[EPISODE_MODERATOR],
  })

  for (const e of planned) {
    console.log(`  🗓  ${e.date}  ${e.topic}   [${e.tag}]`)
    for (const b of e.briefing ?? []) console.log(`        · ${b}`)
    console.log('')
  }

  const merged = saveSchedule(planned)
  console.log(`✓ Wrote ${planned.length} into the calendar (content/schedule.json) — ${merged.length} total.`)
  console.log(`  Edit that file to override anything by hand.\n`)
}

function tomorrow(): string {
  const ms = Date.now() + 86400000
  return new Date(ms).toISOString().slice(0, 10)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
