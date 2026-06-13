import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join, normalize, extname } from 'node:path'
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
