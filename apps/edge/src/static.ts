import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, normalize, extname, dirname } from 'node:path'
import type { ServerResponse } from 'node:http'
import { EPISODES_ROOT } from './persist'

/**
 * Serve the produced audio clips the edge writes to disk. In production the web
 * (on another origin) fetches each turn's audio from HERE, so live playback works
 * off the edge, not the web's static dir. CORS-open; read-only.
 */
const TYPES: Record<string, string> = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.json': 'application/json',
  '.xml': 'application/rss+xml',
  '.html': 'text/html; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
}

// Where to look for the feed + share pages + skill file. The volume (one level
// above /episodes) holds freshly-generated artifacts; the bundled image dir is
// the fallback for files that ship with the build (static.md) or haven't been
// regenerated onto the volume yet (feed/share before the first premiere).
const WEB_PUBLIC = dirname(EPISODES_ROOT)
const BUNDLED_PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '../../web/public')
const PUBLIC_ROOTS = [...new Set([WEB_PUBLIC, BUNDLED_PUBLIC])]

/**
 * Serve the syndication artifacts (feed.xml, feed.json, per-episode share pages
 * under /s/) and the agent skill file (static.md). Tries the volume first, then
 * the bundled image dir, so these never 404 just because a volume is mounted.
 */
export async function servePublic(urlPath: string, res: ServerResponse): Promise<boolean> {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0]))
  const allowed =
    clean === '/feed.xml' ||
    clean === '/feed.json' ||
    clean === '/static.md' ||
    (clean.startsWith('/s/') && clean.endsWith('.html'))
  if (!allowed || clean.includes('..')) return false

  for (const root of PUBLIC_ROOTS) {
    const file = join(root, clean)
    try {
      const info = await stat(file)
      if (!info.isFile()) continue
      res.writeHead(200, {
        'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
        'Content-Length': info.size,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
      })
      createReadStream(file).pipe(res)
      return true
    } catch {
      /* try next root */
    }
  }
  res.writeHead(404, { 'Access-Control-Allow-Origin': '*' })
  res.end('not found')
  return true
}

/** Handle GET /episodes/<...>. Returns true if it served (or 404'd) the request. */
export async function serveEpisodes(urlPath: string, res: ServerResponse): Promise<boolean> {
  // Strip query, decode, and block path traversal.
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0]))
  if (!clean.startsWith('/episodes/') || clean.includes('..')) return false

  const file = join(EPISODES_ROOT, clean.slice('/episodes/'.length))
  try {
    const info = await stat(file)
    if (!info.isFile()) throw new Error('not a file')
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Content-Length': info.size,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=31536000, immutable',
    })
    createReadStream(file).pipe(res)
  } catch {
    res.writeHead(404, { 'Access-Control-Allow-Origin': '*' })
    res.end('not found')
  }
  return true
}
