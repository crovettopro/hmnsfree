import { fileURLToPath } from 'node:url'
import { dirname, join, basename } from 'node:path'
import { readFile, writeFile, unlink, stat } from 'node:fs/promises'
import { spawn } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const EPISODES_ROOT = join(__dirname, '../../web/public/episodes')
const WEB_PUBLIC = join(__dirname, '../../web/public')

/**
 * Stitch one episode's per-turn clips into a single podcast `episode.mp3`:
 *   intro → [turn, gap, turn, gap, …] → outro
 *
 * The GAP is a real silence between every turn (default 360ms) so the speakers
 * get a beat and never feel like they cut each other off — the thing a raw
 * concatenation (clips glued back-to-back) gets wrong.
 *
 * Usage: pnpm --filter @static/studio stitch --id ep-031
 */
const GAP_MS = Number(process.env.STATIC_STITCH_GAP_MS ?? 360)

function exec(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'ignore' })
    p.on('error', reject)
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))))
  })
}

const exists = (p: string) => stat(p).then(() => true).catch(() => false)
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const id = arg('id')
  if (!id) {
    console.error('✗ Pass --id ep-XXX')
    process.exit(1)
  }
  const dir = join(EPISODES_ROOT, id)
  const ep = JSON.parse(await readFile(join(dir, 'episode.json'), 'utf8')) as {
    turns: { audio?: { url?: string } }[]
  }
  const clips = ep.turns.map((t) => t.audio?.url).filter((u): u is string => !!u)
  if (!clips.length) {
    console.error('✗ No clips in episode.json')
    process.exit(1)
  }

  // A real silence clip to drop between turns (same format as the MiniMax clips
  // so the concat can stream-copy without re-encoding).
  const gap = join(dir, '.gap.mp3')
  await exec('ffmpeg', [
    '-y', '-f', 'lavfi', '-i', 'anullsrc=r=32000:cl=mono',
    '-t', String(GAP_MS / 1000), '-c:a', 'libmp3lame', '-b:a', '128k', gap,
  ])

  const intro = join(WEB_PUBLIC, 'intro.mp3')
  const outro = join(WEB_PUBLIC, 'outro.mp3')
  const seg: string[] = []
  if (await exists(intro)) seg.push(intro, gap)
  clips.forEach((u, i) => {
    seg.push(join(dir, 'audio', basename(u)))
    if (i < clips.length - 1) seg.push(gap) // beat between turns, not after the last
  })
  if (await exists(outro)) seg.push(gap, outro)

  const out = join(dir, 'episode.mp3')
  const listPath = join(dir, '.stitch.txt')
  await writeFile(listPath, seg.map((c) => `file '${c.replace(/'/g, "'\\''")}'`).join('\n'))
  try {
    await exec('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', out])
  } catch {
    await exec('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c:a', 'libmp3lame', '-q:a', '4', out])
  } finally {
    await unlink(listPath).catch(() => {})
    await unlink(gap).catch(() => {})
  }
  const bytes = (await stat(out)).size
  console.log(
    `✓ ${out}\n  ${clips.length} turns + ${GAP_MS}ms gaps` +
      `${(await exists(intro)) ? ' + intro' : ''}${(await exists(outro)) ? ' + outro' : ''}` +
      `  (${(bytes / 1e6).toFixed(1)} MB)`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
